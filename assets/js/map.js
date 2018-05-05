let currentPOIs; // string
let mode; // 'advanced', 'basic'
let navigationEnabled = false; // true if location access granted and accuracy < 100 m
let userLocation;
let geoPermissionState;

const geoSettings = {
    enableHighAccuracy: false,
    maximumAge        : 60000,
    timeout           : 20000
};

mapboxgl.accessToken = "pk.eyJ1IjoiZXZuaWNhIiwiYSI6ImNqZWxkM3UydTFrNzcycW1ldzZlMGppazUifQ.0p6IptRwe8QjDHuDp9SNjQ";

let map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/satellite-streets-v10",
    center: [16.35, 48.2],
    zoom: 13
});

map.addControl(new mapboxgl.ScaleControl());

const nav = new mapboxgl.NavigationControl( {options: { showZoom : false }} );
map.addControl(nav, 'top-left');

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
};

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
};

map.on('load', function(){
    checkGeolocationPermit();

    let geolocateControl = new mapboxgl.GeolocateControl({
        positionOptions: geoSettings,
        trackUserLocation: true,
        showUserLocation: true
    });
    map.addControl(geolocateControl, 'top-left');

    const url = new URL(window.location.href);
    const parameters = {
        tripType: url.searchParams.get('tripType')
    };
    $.get("CycleJoyIO", $.param(parameters), function (response) {
        currentPOIs = response;
        /*currentPOIs.features.forEach(function(marker){
            let f1 = document.createElement('div');
            f1.className = 'marker';
            new mapboxgl.Marker(f1).setLngLat(marker.geometry.coordinates).addTo(map);
        });*/
    });
});

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

function getLocationIfAvailable(state){

    if(state === 'denied'){
        inform("Your location data is not available. Bike your Brain switched to basic functions.");
        mode = 'basic';
        navigationEnabled = false;
    }
    else{
        if(state === 'prompt'){
            inform("To enable the app's full functionality please enable location access when prompted.");
        }
        navigator.geolocation.getCurrentPosition(geolocationGranted, geolocationError, geoSettings);
    }
}

function inform(message) {
    alert(message)
}

function askYesNo(message){

}

function loadClosestPOI() {
    alert("load closest POI");

}