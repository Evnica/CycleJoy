/*
* BIKE Your BRAIN (aka CycleJoy) is a web app for those who wants to exercise the mind together with the body.
* Current version does not !yet! contain a quiz implementation
* It focuses on the basic functionality such as displaying predefined and user generated locations with different popups
* and allows to create new locations adding custom attributes
* The app tracks the user location if allowed and if the user is located in Vienna (otherwise tracking makes no sense
* and the app switches to basic mode).
* In the advanced mode user gets information only about the forward location. When the user is nearby, he is offered a
* quiz question an gets directions to the next location.
* In the basic mode, all the locations of the trip are displayed on load, and quiz is not available.
* Editor mode allows to add custom locations to the map. In the current version it has open access. When time allows,
* the following version will require entering a secret code before editing.
* NB: Server interaction is implemented with the help of Java Servlets. At this point only reading of server files is
* supported. Writing to the file after user updates the list of locations will be supported in the version 0.13.
*
* Date: 02.06.2018
* Version: 0.18
* Authors: D. Strelnikova (d.strelnikova@fh-kaernten.at), J. Stratmann (Judith.Stratmann@edu.fh-kaernten.ac.at )
*
* All the efforts were made to reference the code that inspired creation of this file. Some of the snippets address
* examples found on jquery and mapbox websites
* */

let currentPOIs; // string representation of built-in POIs
let currentPopups = [];
let userAddedLocations; //  user added locations
let userMarkers = [];
let mode; // 'advanced' - if location access is available, 'basic'
let navigationEnabled = false; // true if location access granted and accuracy < 250 m
let userLocation; // position returned by navigator
let geoPermissionState; // granted, denied or prompt
let editor = false; // if true, a tool to draw points gets displayed
let debug = true; // for development purposes only, to test features without interaction with the server
let tripRelatedMarkers = [];
let visitedPOIsCount = 0;
let drawActive = false;
let hint; // quiz hint
let idx; // quiz correct answer
let currentTarget; // current target marker in the advanced mode
let communityLocationsDisplayed = false;
// possible shortest routes for the kids trip, depending on the starting point
let chosenRoute = null;
let kidsTripRoutes = {
    '21' : {
        route : [22, 25, 24, 23],
        visited : [false, false, false, false]
    },
    '23' : {
        route : [24, 25, 22, 21],
        visited : [false, false, false, false]
    }
};
let cultureTripRoutes = {
    '13' : {
        route : [15, 11, 12, 14],
        visited : [false, false, false, false]
    },
    '14' : {
        route : [12, 11, 15, 13],
        visited : [false, false, false, false]
    }
};
let nightTripRoutes = {
    '32' : {
        route : [33, 35, 31, 34],
        visited : [false, false, false, false]
    },
    '34' : {
        route : [31, 35, 33, 32],
        visited : [false, false, false, false]
    },
    '35' : {
        route : [31, 34, 33, 32],
        visited : [false, false, false, false]
    }
};

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
const tripTypeParameter = {
    tripType: url.searchParams.get('tripType')
};

const styles = ["mapbox://styles/mapbox/satellite-streets-v10", //satellite imagery with labels
                "mapbox://styles/mapbox/dark-v9", // black background
                "mapbox://styles/mapbox/navigation-preview-day-v2", // traffic
                "mapbox://styles/mapbox/streets-v10" // standard map
];

// select map style depending on the chosen trip type
let currentStyleIndex;
switch (tripTypeParameter.tripType){
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

/*/!*
* The app targets cyclists in Vienna, and therefore limits the map extent to Vienna region
* *!/
const bounds = [[16.130798, 48.090050], [16.620376, 48.331649]];*/

/*
* The default map style is satellite
* */
let map = new mapboxgl.Map({
    container: "map",
    style: styles[currentStyleIndex],
    center: [16.35, 48.2],
    zoom: 13,
    // bounds are logical, but none of us is in Vienna, so they make no sense!
    //maxBounds: bounds
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
        removeAllUserAddedMarkers();
        requestCommunityLocationsFromServer();
        $('#communityLocations').removeClass('displayed').prop('title', 'Display community locations');
        if(editor){
            map.removeControl(draw);
            $('#editor').removeClass('displayed').prop('title', 'Enter editor mode');
            setGrab();
            editor = !editor;
        }
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
    //TODO: prompt user to enter a code that enables the editing mode - if time permits! Not a strict requirement
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
* load only the forward POI
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
   // if (pointInBounds(userLocation.coords.longitude, userLocation.coords.latitude, bounds)) {
        map.addControl(geolocateControl, 'top-left');

        if (userLocation.coords.accuracy < 250 || debug){
            navigationEnabled = true;
        }
    //}else{
        if (!debug) {
            inform('You are located outside of the game area. The app switches to basic mode');
            mode = 'basic';
        }
  //  }

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

    if (!isOpera){
        btnTxt = element.textContent;
    }
    else{
        btnTxt = element.lastChild.data;
    }

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
            // check radius; if not within 250m from the target and not debugging, then do not display quiz
            let closeEnough = false;

            const quizQuestion = $('#quizQ_' + id).text();
            const quizAnswer = $('#quizA_' + id).text().split(',');
            hint = $('#hint_' + id).text();
            idx = $('#index_' + id).text();

            navigator.geolocation.getCurrentPosition(function(position){
                userLocation = position;
                console.log('your coords: ' + userLocation.coords.longitude + ', ' + userLocation.coords.latitude);
                console.log('accuracy: ' + userLocation.coords.accuracy);
                console.log('target: ' + currentTarget.geometry.coordinates);
                const from = turf.point([userLocation.coords.longitude, userLocation.coords.latitude]);
                const to = turf.point([currentTarget.geometry.coordinates[0], currentTarget.geometry.coordinates[1]]);
                const distance = turf.distance(from, to);

                console.log('distance: ' + distance + ' km');

                setQuizContainer(distance, quizQuestion, quizAnswer)

            }, function (error) {
                console.warn(`ERROR(${error.code}): ${error.message}`);
                inform("An error occurred. Have you considered a job of a software tester? " +
                    "You will be very successful in this position!");
            }, geoSettings);
        }
        $('#ppBtn_' + id).text('CLOSE');
        $('#marker_' + id).addClass('visited');
        $('.mapboxgl-popup').each( function () {
            $(this).remove();
        } );
    }
}

function setQuizContainer(distance,  quizQuestion, quizAnswer){

    if (debug || distance < 0.25){
        $('#quizBtn').text('SUBMIT');
        $('#quizQ').text(quizQuestion);
        $('#quizA').removeClass('hidden');
        for (let i = 3; i > -1; i--){
            $('#option' + i).html('<input  type="radio" name="quizAnswerOption" value="'
                + i + '" checked>' + quizAnswer[i] + '<br>');
        }
        $('#quizContainer').removeClass('hidden');
    }
    else{
        inform('You have to be within 250m from a target location to access the quiz. Your current distance ' +
            'to the forward target is ' + distance);
    }
}

let triesCount = 0;
let forward;

function submit(element){

    if (visitedPOIsCount === 0){
        forward = true;
    }

    let btnTxt;

    if (!isOpera){
        btnTxt = element.textContent;
    }
    else{
        btnTxt = element.lastChild.data;
    }

    if (btnTxt === 'SUBMIT'){

        let answer = $( 'input[name=quizAnswerOption]:checked' ).val();
        if (triesCount === 0){
            if (answer === idx){
                $('#quizA').addClass('hidden');
                // check whether there are still locations to be forwarded to available
                if (visitedPOIsCount < currentPOIs.features.length -1) {
                    $('#quizQ').html('Great job! You are attentive and your answer is correct!<br> Your next target awaits!');
                    $('#quizBtn').text("FORWARD!");
                }
                else { // all locations are visited
                    $('#quizQ').html('Brilliant answer! You have reached the end of this journey. Congratulations!');
                    $('#quizBtn').text("END");
                }
            }
            else{
                $('#quizQ').html('Ooops, wrong answer! Try again! Hint:<br>' + hint);
                triesCount++;
            }
        }
        //second submission
        else{
            $('#quizA').addClass('hidden'); // no point in showing the options further
            if (visitedPOIsCount < currentPOIs.features.length -1) {
                // there are still POIs to visit
                if (answer === idx) {
                    $('#quizQ').html('Much better! Congrats!<br> Your next target awaits!');
                }
                else {
                    $('#quizQ')
                        .html("Wrong. But don't worry. You will do better next time. Let's get to the next location and try there!");
                    forward = !forward;
                }
                $('#quizBtn').text("FORWARD!");
            }
            // nothing more to see
            else{
                if (answer === idx) {
                    $('#quizQ').html('Great answer! By the way, this is the end of the trip. Congratulations!');
                }else{
                    $('#quizQ').html('Well, almost right! Anyway, this is the end of the trip. ' +
                        'This fact alone makes you a winner!');
                }
                $('#quizBtn').text("END");
            }
            triesCount = 0;
        }
    } else if (btnTxt === 'FORWARD!'){

        $('#quizContainer').addClass('hidden');
        navigateToTheNext();

    } else{

        $('#quizContainer').addClass('hidden');
        inform("We would like to award your great effort. At least with a kind word =) " +
            "You are magnificent, keep up with the good work!");

    }
}

let color; // color of the line representing a route between target locations

function navigateToTheNext(){
    visitedPOIsCount++;

    if(visitedPOIsCount < currentPOIs.features.length){
        let currentId = currentTarget.properties.id;
        let targetId = -1;
        let url;

        if (chosenRoute === null) {
            switch (tripTypeParameter.tripType) {
                case 'night':
                    chosenRoute = nightTripRoutes[currentId];
                    color = 'red';
                    break;
                case 'kids':
                    chosenRoute = kidsTripRoutes[currentId];
                    color = 'blue';
                    break;
                case 'culture':
                    chosenRoute = cultureTripRoutes[currentId];
                    color = 'yellow';
                    break;
                default:
                    inform('Sorry, no navigation without choosing a trip type.');
            }
        }

        if (forward){
            console.log('off we go!');
            for (let i = 0; i < chosenRoute.visited.length; i++){
                if (!chosenRoute.visited[i]){
                    targetId = chosenRoute.route[i];
                    chosenRoute.visited[i] = true;
                    break;
                }
            }
        }
        else {
            console.log('off we go, but with some loops');
            for (let i = chosenRoute.visited.length - 1; i > -1; i--){
                if (!chosenRoute.visited[i]){
                    targetId = chosenRoute.route[i];
                    chosenRoute.visited[i] = true;
                    break;
                }
            }
        }
        if(debug){
            console.log('The next target is ' + targetId);
        }
        if (targetId !== -1){

            const startCoords = currentTarget.geometry.coordinates;

            for (let i = 0; i < currentPOIs.features.length; i++){
                if(currentPOIs.features[i].properties.id === targetId){
                    currentTarget = currentPOIs.features[i];
                    break;
                }
            }

            for (let i = 0; i < tripRelatedMarkers.length; i++){
                let unit = tripRelatedMarkers[i];
                if(!unit.addedToMap){
                    if(unit.marker._element.id.split('_')[1]*1 === targetId){
                        unit.marker.addTo(map);
                        unit.addedToMap = true;
                        break;
                    }
                }
            }

            url = 'https://api.mapbox.com/directions/v5/mapbox/cycling/' + startCoords[0] + ',' +
                    startCoords[1] + ';' + currentTarget.geometry.coordinates[0] + ',' +
                    currentTarget.geometry.coordinates[1] + '?geometries=geojson&access_token=' +
                mapboxgl.accessToken;

            if(debug){
                console.log('Requesting the data to visualize the route');
            }
            $.ajax({
                method: 'GET',
                url: url
            }).done(function(data){
                // inspired by https://www.mapbox.com/mapbox-gl-js/example/live-update-feature/
                const sourceId = 'trace_'+currentId;

                let coordinates = data.routes[0].geometry.coordinates;
                // this is not the same as line 748, there current target was the old target that is now the starting point
                // here currentTarget is the next POI, that should be the last point in the represented chosenRoute
                coordinates.push(currentTarget.geometry.coordinates);
                data = {
                    "type": "Feature",
                    "properties": {},
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [startCoords]
                    }
                };
                map.addSource(sourceId, { type: 'geojson', data: data });
                map.addLayer({
                    "id": sourceId,
                    "type": "line",
                    "source": sourceId,
                    "paint": {
                        "line-color": color,
                        "line-opacity": 0.75,
                        "line-width": 4
                    }
                });
                map.jumpTo({ 'center': startCoords, 'zoom': 14 });
                let i = 0;
                let timer = window.setInterval(function() {
                    if (i < coordinates.length) {
                        data.geometry.coordinates.push(coordinates[i]);
                        map.getSource(sourceId).setData(data);
                        //map.panTo(coordinates[i]);
                        i++;
                    } else {
                        window.clearInterval(timer);
                    }
                }, 100);


            });
        } else {
            alert('Something went wrong. ' +
                'Please buy the developers some Red Bull so they could be more productive in the night!')
        }
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
            userAddedLocations.features[idxFound] = savedLocation;
        }
        else{
            userAddedLocations.features.push( savedLocation );
        }

        console.log(JSON.stringify(userAddedLocations));
        $('.mapboxgl-popup').each(function () {
            $(this).remove();
        });
        const markersParameter = {
            'markers': JSON.stringify(userAddedLocations)
        };
        $.ajax({
            url: 'assets/php/write.php',
            data : markersParameter,
            type: 'POST'
        });
        /*$.post("CycleJoyIO", $.param(markersParameter), function (response) {
            if(response.status === 'OK'){
                inform('Your edits have been saved')
            }
            else if(response.status === 'EMPTY'){
                //TODO: implement empty user locations on delete of all
                alert('EMPTY!');
            }
            else{
                alert(response.status);
            }
        });*/



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
        let popup = createPoiPopup(feature);
        currentPopups[feature.properties.id] = popup;
        marker.setLngLat(feature.geometry.coordinates).setPopup(popup);
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
        userMarkers.push(marker);
    }
}

function removeAllUserAddedMarkers(){
    userMarkers.forEach(function(marker){
       marker.remove();
    });
}
//---------------------------------------------------------------------------------------------------------------------
//---------------------------------------- SERVER and API INTERACTION -------------------------------------------------
//---------------------------------------------------------------------------------------------------------------------

/*
* Load the forward POI in advanced mode after calculating the chosenRoute and distance to each of the pre-defined POIs.
* In basic mode load all POIs.
*/
function loadPOIs(pois) {
        if(mode === 'advanced'){
            let index = 0;
            let min = Infinity;
            let indexOfMin;
            let poisWithDistances = [];
            let from = [userLocation.coords.longitude, userLocation.coords.latitude];
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
                    console.log(data.waypoints[1].location + ', ' + data.routes[0].distance);
                    poisWithDistances.push({
                        feature: feature,
                        distance: data.routes[0].distance
                    });
                    index++;
                    if (index === pois.features.length)
                    {
                        poisWithDistances.forEach(function(poi){
                            const id = poi.feature.properties.id;
                            // for each trip type there are 2-3 possible starts of the route
                            // need to choose the forward of these start locations to the user
                            switch (tripTypeParameter.tripType){
                                case 'culture':
                                    if ( (id === 13 || id === 14) && poi.distance < min)
                                    {
                                        min = poi.distance;
                                        console.log('Current closest: ' + poi.feature.properties.Name);
                                    }
                                    break;
                                case 'kids':
                                    if ( (id === 21 || id === 23) && poi.distance < min)
                                    {
                                        min = poi.distance;
                                        console.log('Current closest: ' + poi.feature.properties.Name);
                                    }
                                    break;
                                case 'night':
                                    if ( (id === 32 || id === 34 || id === 35) && poi.distance < min)
                                    {
                                        min = poi.distance;
                                        console.log('Current closest: ' + poi.feature.properties.Name);
                                    }
                                    break;
                                    // no trip type chosen - find the forward location of all
                                    // but it is only informative since there will be no directions
                                default:
                                    if ( poi.distance < min)
                                    {
                                        min = poi.distance;
                                        console.log('Current closest: ' + poi.feature.properties.Name);
                                    }
                                    break;
                            }
                        });
                        poisWithDistances.forEach(function(poi){
                            if (poi.distance === min) {
                                createMarkerAndAdd(poi.feature, true, 'tripRelated', '');
                                currentTarget = poi.feature;
                            }
                            else{
                                createMarkerAndAdd(poi.feature, false, 'tripRelated', '');
                            }
                        })
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
    $.ajax({ url: 'data/' + tripTypeParameter.tripType + '.json', success: function (content) {
            currentPOIs = content;
            loadPOIs(content);
        } });
}

/* An auxiliary function to load JSON community locations content from the server */
function requestCommunityLocationsFromServer() {
    $.ajax({ url: 'assets/php/data/userMarkers.json', success: function (content) {
            userAddedLocations = content;
            // make community locations
            content.features.forEach(function(feature){
                createMarkerAndAdd(feature, true, 'userGenerated', 'hidden');
            });
        } });
}

/* Preventing request to the server if no trip type was chosen (user loaded the map.html directly) */
function requestPOIifTypeChosen() {
    if (tripTypeParameter.tripType !== null) {
        requestPOIsFromServer();
    }
    //for test purposes only! will not be there in the production version
    else{
        if(debug)
        {
            $.ajax({ url: 'data/night.json', success: function (content) {
                    currentPOIs = content;
                    mode = 'basic';
                    loadPOIs(content);
                } });
            $.ajax({ url: 'assets/php/data/userMarkers.json', success: function (content) {
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