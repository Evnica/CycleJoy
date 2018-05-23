/*
* Basic functions for the homepage
*
* Date: 23.05.2018
* Version: 0.2
* Authors: D. Strelnikova(d.strelnikova@fh-kaernten.at)

* */

Element.prototype.getOffsetTop = function () {
    return this.offsetTop + ( this.offsetParent ? this.offsetParent.getOffsetTop() : 0 );
};

function go(tripType) {
    window.location.href = "map.html?tripType=" + tripType;
}

/*When the trip type is chosen in the header, the page content is scrolled to the corresponding section*/
function scrollToElement(id){
    let top = 200;
    switch (id){
        case "culturalTrip":
            top = document.getElementById( "culturalTrip" ).getOffsetTop() - ( window.innerHeight / 6 );
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



