Element.prototype.getOffsetTop = function () {
    return this.offsetTop + ( this.offsetParent ? this.offsetParent.getOffsetTop() : 0 );
};

function go(tripType) {
    window.location.href = "map.html?tripType=" + tripType;
}

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



