let currentPOIs; // string
let mode; // 'advanced', 'basic'

mapboxgl.accessToken = "pk.eyJ1IjoiZXZuaWNhIiwiYSI6ImNqZWxkM3UydTFrNzcycW1ldzZlMGppazUifQ.0p6IptRwe8QjDHuDp9SNjQ";

let map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/satellite-streets-v10",
    center: [16.35, 48.2],
    zoom: 13
});

let userLocation;
let geoPermissionState;

const geoSettings = {
    enableHighAccuracy: false,
    maximumAge        : 60000,
    timeout           : 20000
};


let geolocationError = function(error){
    console.log(error.code);
    inform("Your location could not be obtained. The app has switched to the basic functionality.");
    mode = 'basic';
};

let geolocationGranted = function(position) {
    userLocation = position;
    console.log(userLocation.coords.latitude);
    console.log(userLocation.coords.longitude);
    mode = 'advanced';
};

map.on('load', function(){
    checkGeolocationPermit();
    const url = new URL(window.location.href);
    const parameters = {
        tripType: url.searchParams.get('tripType')
    };
    $.get("CycleJoyIO", $.param(parameters), function (response) {
        currentPOIs = response;
        currentPOIs.features.forEach(function(marker){
            let f1 = document.createElement('div');
            f1.className = 'marker';
            new mapboxgl.Marker(f1).setLngLat(marker.geometry.coordinates).addTo(map);
        });
    });
});

function checkGeolocationPermit() {
    if (navigator.geolocation){
        navigator.permissions.query({name:'geolocation'})
            .then(function (permissionStatus) {
                permissionStatus.onchange = getLocationIfAvailable(permissionStatus.state);
                geoPermissionState = permissionStatus.state;
            });
    }
    else {
        inform("The app will have limited functionality since geolocation is not supported by your browser")
    }
}

function getLocationIfAvailable(state){
    switch (state){
        case "granted":
            navigator.geolocation.getCurrentPosition(geolocationGranted, geolocationError, geoSettings);
            break;
        case 'denied':
            inform("Your location data is not available. Bike your Brain switched to basic functions.");
            mode = 'basic';
            break;
        case 'prompt':
            inform("To enable the app's full functionality please enable location access when prompted.");
            navigator.geolocation.getCurrentPosition(geolocationGranted, geolocationError, geoSettings);
            console.log("in prompt");
            break;
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