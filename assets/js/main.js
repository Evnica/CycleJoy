let currentPOIs; // string

Element.prototype.getOffsetTop = function () {
    return this.offsetTop + ( this.offsetParent ? this.offsetParent.getOffsetTop() : 0 );
};

mapboxgl.accessToken = "pk.eyJ1IjoiZXZuaWNhIiwiYSI6ImNqZWxkM3UydTFrNzcycW1ldzZlMGppazUifQ.0p6IptRwe8QjDHuDp9SNjQ";

let map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/satellite-streets-v10",
    center: [16.35, 48.2],
    zoom: 13
});

map.on('load', function(){

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


function go(tripType) {

    window.location.href = "map.html?tripType=" + tripType;

}


function scrollToElement(id){
    let top = 200;
    switch (id){
        case "historicalTrip":
            top = document.getElementById( "historicalTrip" ).getOffsetTop() - ( window.innerHeight / 6 );
            break;
        case "nightTrip":
            top = document.getElementById( "nightTrip" ).getOffsetTop() - ( window.innerHeight / 6 );
            break;
        case "kidsTrip":
            top = document.getElementById( "kidsTrip" ).getOffsetTop() - ( window.innerHeight / 6 );
            break;
    }
    window.scrollTo( 0, top );
}



