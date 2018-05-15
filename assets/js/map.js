let currentPOIs; // string representation of built-in POIs
let userAddedLocations; // string representation of user added locations
let mode; // 'advanced' - if location access is available, 'basic'
let navigationEnabled = false; // true if location access granted and accuracy < 100 m
let userLocation; // position returned by navigator
let geoPermissionState; // granted, denied or prompt
let editor = false;

// position retrieval settings
const geoSettings = {
    enableHighAccuracy: false, // no real navigation is provided, a hight accuracy (~1m) position is not needed
    maximumAge        : 60000, // position no older than 1 minute since cyclists can move pretty fast
    timeout           : 30000  // give some time to users with slower reaction to think about the prompt
};

// depending on the requested trip type, different POIs are loaded and different background maps are applied
const url = new URL(window.location.href);
const parameters = {
    tripType: url.searchParams.get('tripType')
};

const styles = ["mapbox://styles/mapbox/satellite-streets-v10", //satellite imagery with labels
                "mapbox://styles/mapbox/dark-v9", // black background
                "mapbox://styles/mapbox/navigation-preview-day-v2", // traffic
                "mapbox://styles/mapbox/streets-v10" // standard map
];

// select map style depending on the chosen trip type
let currentStyleIndex;
switch (parameters.tripType){
    case 'night':
        currentStyleIndex = 1;
        break;
    case 'kids':
        currentStyleIndex = 3;
        break;
    case 'culture':
        currentStyleIndex = 0;
        break;
    default:
        currentStyleIndex = 2;
}

// access token has to be restricted to a certain domain in a real world app
mapboxgl.accessToken = "pk.eyJ1IjoiZXZuaWNhIiwiYSI6ImNqZWxkM3UydTFrNzcycW1ldzZlMGppazUifQ.0p6IptRwe8QjDHuDp9SNjQ";

/*
* If geolocation available in the browser, the state of geolocation permission is queried
* See getLocationIfAvailable(state) for further info
* */
checkGeolocationPermit();



/*
* The app targets cyclists in Vienna, and therefore limits the map extent to Vienna region
* */
const bounds = [[16.130798, 48.090050], [16.620376, 48.331649]];

/*
* The default map style is satellite
* */
let map = new mapboxgl.Map({
    container: "map",
    style: styles[currentStyleIndex],
    center: [16.35, 48.2],
    zoom: 13,
    maxBounds: bounds
});

//---------------------------------------------------------------------------------------------------------------------
//------------------------------------------------ MAP CONTROLS -------------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------
// map style
// ES6 implementation of the background map style control
class MapStyleControl {
    onAdd(map) {
        this._map = map;
        this._container = document.createElement('div');
        const button = document.createElement('button');
        button.className = 'icon fa fa-map';
        button.onclick = function () {
            if (currentStyleIndex < 3){
                currentStyleIndex++;
            }
            else {
                currentStyleIndex = 0;
            }
            changeBackgroundStyle(currentStyleIndex);
        };
        this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
        //this._container.textContent = 'Background';
        this._container.appendChild(button);
        return this._container;
    }

    onRemove() {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
    }
}
// toggle background style
function changeBackgroundStyle(index){
    map.setStyle(styles[index]);
}
map.addControl(new MapStyleControl(), 'top-left');

// Scale
map.addControl(new mapboxgl.ScaleControl());

// Compass
const nav = new mapboxgl.NavigationControl({ showZoom: false });
map.addControl(nav, 'top-left');

// geolocation
let geolocateControl = new mapboxgl.GeolocateControl({
    positionOptions: geoSettings,
    trackUserLocation: true,
    showUserLocation: true
});
map.addControl(geolocateControl, 'top-left');

// draw
const draw = new MapboxDraw({ controls: {
                                point: true,
                                line_string: false,
                                polygon: false,
                                trash: true,
                                combine_features: false,
                                uncombine_features: false
                            }
});

// ES6 implementation of the point draw control
class PointDrawControl {
    onAdd(map) {
        this._map = map;
        this._container = document.createElement('div');
        const button = document.createElement('button');
        button.className = 'icon fa fa-edit';
        button.onclick = function () {
            toggleEditor();
        };
        this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
        this._container.appendChild(button);
        return this._container;
    }

    onRemove() {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
    }
}

function toggleEditor() {
    if(editor){
        map.removeControl(draw);
    }
    else {
        map.addControl(draw, 'top-right');
    }
    editor = !editor;
}

map.addControl(new PointDrawControl(), 'top-right');

//---------------------------------------------------------------------------------------------------------------------
//---------------------------------------- HANDLE POSITION REQUEST ----------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------

// position access denied, timeout or navigator error: switch to basic mode and load all POIs relevant to the trip type
let geolocationError = function(error){
    /*
    *       error = {
    *           code - one of the following
                    1 - PERMISSION_DENIED
                    2 - POSITION_UNAVAILABLE
                    3 - TIMEOUT
                message - Details about the error in human-readable format
            }
    */
    console.warn(`ERROR(${error.code}): ${error.message}`);
    inform("Your location could not be obtained. The app has switched to the basic functionality.");
    mode = 'basic';

    requestPOIifTypeChosen();
};

/*
* position access granted: load position, switch to advanced mode and enable navigation for accuracy < 100 m
* load only the closest POI
*/
let geolocationGranted = function(position) {
    /*
    *   position = {
            coords: {
                latitude - Geographical latitude in decimal degrees.
                longitude - Geographical longitude in decimal degrees.
                altitude - Height in meters relative to sea level.
                accuracy - Possible error margin for the coordinates in meters.
                altitudeAccuracy - Possible error margin for the altitude in meters.
                heading - The direction of the device in degrees relative to north.
                speed - The velocity of the device in meters per second.
            }
            timestamp - The time at which the location was retrieved.
        }
    * */
    userLocation = position;
    console.log(userLocation.coords.latitude);
    console.log(userLocation.coords.longitude);
    console.log(userLocation.coords.accuracy);
    mode = 'advanced';
    if (userLocation.coords.accuracy < 100){
        navigationEnabled = true;
    }

    requestPOIifTypeChosen();
};

/*
* check a permit to access user's location, enable permission status change monitoring and trigger the
 * getLocationIfAvailable(state) function
*/
function checkGeolocationPermit() {
    if (navigator.geolocation){
        navigator.permissions.query({name:'geolocation'})
            .then(function (permissionStatus) {
                console.log('geolocation permission state is ', permissionStatus.state);
                permissionStatus.onchange = getLocationIfAvailable(permissionStatus.state);
                geoPermissionState = permissionStatus.state;
            });

    }
    else {
        inform("The app will have limited functionality since geolocation is not supported by your browser")
    }
}

/*
* try to get user location and request
*/
function getLocationIfAvailable(state){

    if(state === 'denied'){
        inform("Your location data is not available. Bike your Brain switched to basic functions.");
        mode = 'basic';
        navigationEnabled = false;
        requestPOIsFromServer();
    }
    else{
        if(state === 'prompt'){
            inform("To enable the app's full functionality please enable location access when prompted.");
        }
        navigator.geolocation.getCurrentPosition(geolocationGranted, geolocationError, geoSettings);
    }
}

//---------------------------------------------------------------------------------------------------------------------
//-----------------------------------  CREATION of MARKERS and POP-UPs ------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------

/* An auxiliary function to add markers to the map based on passed coordinates */
function addMarker(coordinates){
    let f1 = document.createElement('div');
    f1.className = 'marker';
    new mapboxgl.Marker(f1).setLngLat(coordinates).addTo(map);
}

//---------------------------------------------------------------------------------------------------------------------
//---------------------------------------- SERVER and API INTERACTION -------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------

/*
* Load the closest POI in advanced mode after calculating the route and distance to each of the pre-defined POIs.
* In basic mode load all POIs.
*/
function loadPOIs(pois) {
        if(mode === 'advanced'){
            let min = Infinity;
            let index = 0;
            let indexOfMin;
            let from = [userLocation.coords.longitude, userLocation.coords.latitude];
            let targets = []; //{id, coords}
            pois.features.forEach(function (feature) {
                targets.push({ id : index, coords : feature.geometry.coordinates });
                index++;
            });
            index = 0;
            let to;
            let directionsRequest;
            pois.features.forEach(function(feature){
                to = feature.geometry.coordinates;
                directionsRequest = 'https://api.mapbox.com/directions/v5/mapbox/cycling/' + from[0] + ',' +
                    from[1] + ';' + to[0] + ',' + to[1] + '?geometries=geojson&access_token=' +
                    mapboxgl.accessToken;
                $.ajax({
                    method: 'GET',
                    url: directionsRequest
                }).done(function(data){
                    console.log(data.waypoints[1].location);
                    console.log(data.routes[0].distance);
                    if (data.routes[0].distance < min){
                        indexOfMin = index;
                        min = data.routes[0].distance;
                    }
                    index++;
                    if (index === pois.features.length)
                    {
                        console.log(min);
                        addMarker(data.waypoints[1].location);
                    }
                });
            })
        }
        else
        {
            pois.features.forEach(function(marker){
                addMarker(marker.geometry.coordinates);
            });
        }
}

/* An auxiliary function to load JSON content from the server */
function requestPOIsFromServer() {
        $.get("CycleJoyIO", $.param(parameters), function (response) {
            currentPOIs = response;
            loadPOIs(response);
            /*currentPOIs.features.forEach(function(marker){
            let f1 = document.createElement('div');
            f1.className = 'marker';
            new mapboxgl.Marker(f1).setLngLat(marker.geometry.coordinates).addTo(map);
        });*/
        });
}

/* Preventing request to the server if no trip type was chosen (user loaded the map.html directly) */
function requestPOIifTypeChosen() {
    if (parameters.tripType !== null) {
        requestPOIsFromServer();
    }
    else{
        inform("Trip type not chosen. No target locations can be displayed.")
    }
}

//---------------------------------------------------------------------------------------------------------------------
//--------------------------------------------------- DIALOGS ---------------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------

function inform(message) {
    alert(message)
}