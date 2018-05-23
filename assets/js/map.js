/*
* BIKE Your BRAIN (aka CycleJoy) is a web app for those who wants to exercise the mind together with the body.
* Current version does not !yet! contain a quiz implementation
* It focuses on the basic functionality such as displaying predefined and user generated locations with different popups
* and allows to create new locations adding custom attributes
* The app tracks the user location if allowed and if the user is located in Vienna (otherwise tracking makes no sense
* and the app switches to basic mode).
* In the advanced mode user gets information only about the closest location. When the user is nearby, he is offered a
* quiz question an gets directions to the next location.
* In the basic mode, all the locations of the trip are displayed on load, and quiz is not available.
* Editor mode allows to add custom locations to the map. In the current version it has open access. When time allows,
* the following version will require entering a secret code before editing.
* NB: Server interaction is implemented with the help of Java Servlets. At this point only reading of server files is
* supported. Writing to the file after user updates the list of locations will be supported in the version 0.13.
*
* Date: 23.05.2018
* Version: 0.12
* Authors: D. Strelnikova (d.strelnikova@fh-kaernten.at), J. Stratmann (Judith.Stratmann@edu.fh-kaernten.ac.at )
*
* All the efforts were made to reference the code that inspired creation of this file. Some of the snippets address
* examples found on jquery and mapbox websites
* */

let currentPOIs; // string representation of built-in POIs
let userAddedLocations; //  user added locations
let mode; // 'advanced' - if location access is available, 'basic'
let navigationEnabled = false; // true if location access granted and accuracy < 100 m
let userLocation; // position returned by navigator
let geoPermissionState; // granted, denied or prompt
let editor = false; // if true, a tool to draw points gets displayed
let debug = true; // for development purposes only, to test features without interaction with the server
let tripRelatedMarkers = [];
let drawActive = false;
let communityLocationsDisplayed = false;

// browser detection, attribution: https://jsfiddle.net/311aLtkz/
const isOpera = (!!window.opr && !!opr.addons) || !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
//const isFirefox = typeof InstallTrigger !== 'undefined';
const isChrome = !!window.chrome && !!window.chrome.webstore;

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

let canvas = map.getCanvasContainer();

/* Change the mouse cursor to 'grab' when the editing mode is off or point has been added*/
function setGrab(){
    drawActive = false;
    if (isChrome || isOpera) {
        canvas.style.cursor = '-webkit-grab';
    } else {
        canvas.style.cursor = 'grab';
    }
}

// add a marker when in editing mode with the draw feature activated
map.on('click', function (evt) {
    if (drawActive){
        let lngLat = evt.lngLat;
        let currentIds = [];
        userAddedLocations.features.forEach(function (feature) {
            currentIds.push(feature.properties.id.split('-')[1]);
        });
        currentIds.sort();
        const order = currentIds[currentIds.length - 1] * 1 + 1;
        const newId = 'um-' + order;

        let props = {
            "id": newId,
            "name": "",
            "description": "",
            "lat": lngLat.lat,
            "lon": lngLat.lng,
        };

        let newLocation = createLocationObjectFromProperties(props);
        createMarkerAndAdd(newLocation, true, 'userGenerated', '');

        setGrab();
    }

});

// add tooltips to custom controls (editor mode, add point, show community locations)
$( function() {
    $( document ).tooltip();
} );

//---------------------------------------------------------------------------------------------------------------------
//------------------------------------------------ MAP CONTROLS -------------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------
// map style control to toggle backgrounds
class MapStyleControl {
    onAdd(map) {
        this._map = map;
        this._container = document.createElement('div');
        const button = document.createElement('button');
        button.className = 'icon fa fa-map';
        button.title = 'Toggle background';
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

// scale
map.addControl(new mapboxgl.ScaleControl());

// compass
const nav = new mapboxgl.NavigationControl({ showZoom: false });
map.addControl(nav, 'top-left');

/*
 * geolocation control
 * added to the map only if the user (1) allows to access his/her location and (2) is within the map bounds*/
let geolocateControl = new mapboxgl.GeolocateControl({
    positionOptions: geoSettings,
    trackUserLocation: true,
    showUserLocation: true
});

/*
* Control to toggle community locations (user generated points)
* */
class UserGeneratedMarkersControl {
    onAdd(map) {
        this._map = map;
        this._container = document.createElement('div');
        const button = document.createElement('button');
        button.className = 'icon fa fa-users';
        button.id = 'communityLocations';
        button.title = 'Display community locations';
        button.onclick = function () {
            toggleCommunityLocations();
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

/*
* Turn the user generated locations on and off, changing the style of the control button
* */
function toggleCommunityLocations(){
    if(communityLocationsDisplayed){
        $('.userGenerated').addClass('hidden');
        $('#communityLocations').removeClass('displayed').prop('title', 'Display community locations');
    }
    else{
        $('.userGenerated').removeClass('hidden');
        $('#communityLocations').addClass('displayed').prop('title', 'Hide community locations');
    }
    communityLocationsDisplayed = !communityLocationsDisplayed;
}

const communityLocationsControl = new UserGeneratedMarkersControl();
map.addControl(communityLocationsControl, 'top-right');

class EditingControl {
    onAdd(map) {
        this._map = map;
        this._container = document.createElement('div');
        const button = document.createElement('button');
        button.className = 'icon fa fa-edit';
        button.title = 'Enter editor mode';
        button.id = 'editor';
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

class PointDrawControl {
    onAdd(map) {
        this._map = map;
        this._container = document.createElement('div');
        const button = document.createElement('button');
        button.className = 'icon fa fa-map-marker';
        button.title = 'Add a location';
        button.onclick = function () {
            //TODO: implement adding a point
            canvas.style.cursor = 'crosshair'; // who would guess that this is the way to change a cursor? css for map and body will do nothing!
            drawActive = true;

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

const draw = new PointDrawControl();

/*
* Display the marker control for adding locations to the map or hide it if already displayed.
* If community locations are not displayed on the map when editing starts, they need to be added to show users what
* is already available.
* */
function toggleEditor() {
    //TODO: prompt user to enter a code that enables the editing mode
    if(editor){
        map.removeControl(draw);
        $('#editor').removeClass('displayed').prop('title', 'Enter editor mode');
        setGrab();
    }
    else {
        map.addControl(draw, 'top-right');
        $('#editor').addClass('displayed').prop('title', 'Exit editor mode');
        if (!communityLocationsDisplayed) {
            $('#communityLocations').trigger('click');
        }
    }
    editor = !editor;
}

map.addControl(new EditingControl(), 'top-right');

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
* position access granted: load position, switch to advanced mode and enable navigation for accuracy < 250 m
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
    if (pointInBounds(userLocation.coords.longitude, userLocation.coords.latitude, bounds)) {
        map.addControl(geolocateControl, 'top-left');

        if (userLocation.coords.accuracy < 250){
            navigationEnabled = true;
        }
    }
    else{
        inform('You are located outside of the game area. The app switches to basic mode');
        mode = 'basic';
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

function createPoiPopup(feature){

    let popupStructure =
        '    <div class="popupContent active">\n' +
            '    <div id="name_{id}" class="active"><h2>{1}</h2></div>\n' +
            '    <div id="ppDesc_{id}" class="longDescription active">{2}</div>\n' +
            '    <div id="ppOpnHrs_{id}" class="hidden">{3}</div>\n' +
            '    <div id="ppAdmFee_{id}" class="hidden">{4}</div>\n' +
            '    <div id="link_{id}" class="hidden">{5}</div>\n' +
            '    <div id="quizQ_{id}" class="hidden">{6}</div>\n' +
            '    <div id="quizA_{id}" class="hidden">{7}</div>\n' +
            '    <div id="hint_{id}" class="hidden">{8}</div>\n' +
            '    <div id="index_{id}" class="hidden">{9}</div>\n' +
            '    <div class="ppBtnDiv active">\n' +
            '        <div id="ppBtn_{id}" class="ppBtn active" onclick="ppNext(this)">NEXT</div>\n' +
            '    </div>' +
        '    </div>';

    let popup = new mapboxgl.Popup( { offset : 8 } );
    const re = new RegExp('{id}', 'g');
    const openingHours = feature.properties.openingHours != null ?
           '<strong>Opening hours</strong><br>' + feature.properties.openingHours : 'Opening hours: N/A';
    const admissionFee = feature.properties.admissionFee != null ?
            '<br><strong>Admission fee</strong><br>' + feature.properties.admissionFee : '<br>Admission fee: N/A';
    const href = feature.properties.link != null ?
            '</br>Link: <a href="' + feature.properties.link + '" target="_blank">web link</a>' : 'N/A';

    popupStructure = popupStructure.replace(re, feature.properties.id)
                                    .replace('{1}', feature.properties.Name)
                                    .replace('{2}', feature.properties.description)
                                    .replace('{3}', openingHours)
                                    .replace('{4}', admissionFee)
                                    .replace('{5}', href)
                                    .replace('{6}', feature.properties.quizQuestion)
                                    .replace('{7}', feature.properties.quizAnswer)
                                    .replace('{8}', feature.properties.hint)
                                    .replace('{9}', feature.properties.rightAnswerIndex);
    popup.setHTML(popupStructure);

    return popup;
}

// inspired by https://github.com/mapbox/geojson.io/blob/gh-pages/src/ui/map.js
function createCommunityLocationPopup(feature){

    let customProps = '';
    let props = Object.getOwnPropertyNames(feature.properties);
    for (let i = 0; i < props.length; i++){
        if (props[i] !== 'name' && props[i] !== 'description' && props[i] !== 'lat'
                                                              && props[i] !== 'lon' && props[i] !== 'id'){
            customProps +=
                '<tr >' +
                '   <th><input type="text" value="' + props[i] + '"/></th>' +
                '   <td><input type="text" value="' + feature.properties[props[i]] + '"/></td>' +
                '</tr>';
        }
    }

    let popupStructure =
        '    <div class="popupContent active">\n' +
        '    <div id="commLoc_{id}" class="active">' +
        '    <table id="tblCommLoc_{id}" class="commLocPopupTbl">' +
        '        <tbody>' +
        '           <tr >' +
        '              <th>name</th><td><input type="text" value="' + feature.properties.name + '"/></td>' +
        '           </tr>' +
        '           <tr >' +
        '              <th>description</th><td><input type="text" value="'
                                                    + feature.properties.description + '"/></td>' +
        '           </tr>' +
        '           <tr >' +
        '              <th>lat</th><td><input type="text" readonly value="'
                                                    + feature.geometry.coordinates[1] + '"/></td>' +
        '           </tr>' +
        '           <tr >' +
        '              <th>lon</th><td><input type="text" readonly value="'
                                                    + feature.geometry.coordinates[0] + '"/></td>' +
        '           </tr>' +
                    customProps +
        '        </tbody>'+
        '    </table>' +
        '    <div id="addRowBtn_{id}" class="addRowBtn fa fa-plus-square" onclick="addRow(this)">Add row</div>\n' +
        '    </div>\n' +
        '    <div class="ppBtnDiv">\n' +
        '        <div id="ppBtn_{id}" class="ppBtn active" onclick="save(this)">Save</div>\n' +
        '    </div>' +
        '    </div>';

    let popup = new mapboxgl.Popup( { offset : 8 } );
    const re = new RegExp('{id}', 'g');
    popupStructure = popupStructure.replace(re, feature.properties.id);
    popup.setHTML(popupStructure);

    return popup;
}

/*For trip related points, change popup content*/
function ppNext(element) {
    let id = element.id.split('_')[1];
    let btnTxt = element.textContent;
    if (btnTxt === 'NEXT'){
        $("#ppDesc_" + id).removeClass('active').addClass('hidden');
        $("#ppOpnHrs_" + id).addClass('active');
        $("#ppAdmFee_" + id).addClass('active');
        $("#link_" + id).addClass('active');
        if (mode === 'advanced') {
            $('#ppBtn_' + id).text('TO QUIZ');
        }
        else{
            $('#ppBtn_' + id).text('CLOSE');
        }
    }
    else {
        if(btnTxt === 'TO QUIZ'){

            const quizQuestion = $('#quizQ_' + id).text();
            const quizAnswer = $('#quizA_' + id).text();
            const hint = $('#hint_' + id).text();
            const idx = $('#index_' + id).text();

            //TODO: implement quiz, including location check (only offer the quiz when user is near the POI)

            inform('here will be a quiz that is not yet implemented, asking\n ' + quizQuestion)
        }
        $('#marker_' + id).addClass('visited');
        $('.mapboxgl-popup').each( function () {
            $(this).remove();
        } );
    }

}

/*Add a row to the user generated location popup for custom key-value pairs*/
function addRow(btn){
    let id = $(btn).prop('id').split('_')[1];
    $('#tblCommLoc_' + id + ' tr:last')
        .after('<tr ><th><input type="text" value=""/></th><td><input type="text" value=""/></td></tr>' );
}

/*Save the content of the user generated location popup in case name and description are specified*/
function save(btn){
    let key, value;
    let id = $(btn).prop('id').split('_')[1];
    let locationObjectProperties = {"id" : id};
    $('#tblCommLoc_' + id).find('tr').each(function (i, tr) {
        if (i < 4){
            key = $(tr).children().get(0).innerText;
        }
        else{
            let tmp1 = $(tr).children().get(0);
            key = tmp1.children[0].value;
        }
        value = $(tr).children().get(1).children[0].value;
        locationObjectProperties[key] = value;

    });

    if (locationObjectProperties.name !== '' && locationObjectProperties.description !== '') {
        let savedLocation = createLocationObjectFromProperties(locationObjectProperties);
        let idxFound = -1;

        for (let i = 0; i < userAddedLocations.features.length; i++) {
            if (userAddedLocations.features[i].properties.id === savedLocation.properties.id) {
                idxFound = i;
                break;
            }
        }
        if (idxFound !== -1) {
            delete userAddedLocations.features[idxFound];
        }
        userAddedLocations.features[idxFound] = savedLocation;
        console.log(JSON.stringify(userAddedLocations));
        $('.mapboxgl-popup').each(function () {
            $(this).remove();
        });
    }
    else{
        inform('Name and description must be provided before saving a location');
    }
}

/*Convert a set of properties into a json location object*/
function createLocationObjectFromProperties(locationObjectProperties){
    return {
        "type": "Feature",
        "properties" : locationObjectProperties,
        "geometry": {
            "type": "Point",
            "coordinates": [locationObjectProperties.lon, locationObjectProperties.lat]
        }
    };
}

/* An auxiliary function to add markers to the map based on passed coordinates
*  Type can be userGenerated or tripRelated
* */
function createMarkerAndAdd(feature, addToMap, type, hidden){
    //create container for a marker
    let markerDiv = document.createElement('div');
    markerDiv.className = 'marker ' + type  + ' ' + hidden;
    markerDiv.id = 'marker_' + feature.properties.id;
    //create a marker, set its location and popup
    let marker = new mapboxgl.Marker(markerDiv);
    if (type === 'tripRelated') {
        marker.setLngLat(feature.geometry.coordinates).setPopup(createPoiPopup(feature));
    }
    else {
        marker.setLngLat(feature.geometry.coordinates).setPopup(createCommunityLocationPopup(feature));
    }

    if (type === 'tripRelated'){
        if (addToMap)
        {
            marker.addTo(map);
            tripRelatedMarkers.push({
                marker: marker,
                addedToMap: true
            })
        }
        else{
            tripRelatedMarkers.push({
                marker: marker,
                addedToMap: false
            })
        }
    }
    // for user community locations
    else{
        marker.addTo(map);
    }
}

function addMarker2(coordinates){
    for (let i = 0; i < tripRelatedMarkers.length; i++){
        if(tripRelatedMarkers[i].getLngLat() === coordinates){
            tripRelatedMarkers[i].addTo(map);
            break;
        }
    }
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
                createMarkerAndAdd(feature, false, 'tripRelated', '');
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
                        addMarker2(data.waypoints[1].location);
                    }
                });
            })
        }
        else
        {
            pois.features.forEach(function(feature){
                createMarkerAndAdd(feature, true, 'tripRelated', '');
            });
        }
}

/* An auxiliary function to load JSON POI content from the server */
function requestPOIsFromServer() {
    $.get("CycleJoyIO", $.param(parameters), function (response) {
        currentPOIs = response;
        loadPOIs(response);
    });
}

/* An auxiliary function to load JSON community locations content from the server */
function requestCommunityLocationsFromServer() {
    //TODO: implement reading a file with community locations from server
    $.get("CycleJoyIO", $.param({"tripType" : "user"}), function (response) {
        userAddedLocations = response;
        response.features.forEach(function(feature){
            createMarkerAndAdd(feature, true, 'userGenerated', 'hidden');
        });
    });
}

/* Preventing request to the server if no trip type was chosen (user loaded the map.html directly) */
function requestPOIifTypeChosen() {
    if (parameters.tripType !== null) {
        requestPOIsFromServer();
    }
    //for test purposes only! will not be there in the production version
    else{
        if(debug)
        {
            $.ajax({ url: 'data/culture.json', success: function (content) {
                    currentPOIs = content;
                    mode = 'basic';
                    loadPOIs(content);
                } });
            $.ajax({ url: 'data/userMarkers.json', success: function (content) {
                    userAddedLocations = content;
                    // make community locations
                    content.features.forEach(function(feature){
                        createMarkerAndAdd(feature, true, 'userGenerated', 'hidden');
                    });
                } })
        }
        else{
            inform("Trip type not chosen. No target locations can be displayed.");
        }
    }
    requestCommunityLocationsFromServer();
}

//---------------------------------------------------------------------------------------------------------------------
//--------------------------------------------------- DIALOGS ---------------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------
/*Inform user or prompt simple actions*/
function inform(message) {
    //TODO: style the information dialog; 2 separate versions: 1 for quiz, 1 for information only
    alert(message)
}

//---------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------  OTHER  ---------------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------
/*Check whether a point is within a polygon (assessment of the user location; if not within Vienna region,
* advanced mode can't be applied since tracking and routing are not applicable*/
function pointInBounds(pointX, pointY, bounds) {
    //bounds = [[bottom left], [top right]]
    return pointX >= bounds[0][0] && pointX <= bounds[1][0] && pointY >= bounds[0][1] && pointY <= bounds[1][1];
}