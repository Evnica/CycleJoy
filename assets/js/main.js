Element.prototype.getOffsetTop = function () {
    return this.offsetTop + ( this.offsetParent ? this.offsetParent.getOffsetTop() : 0 );
};

function goNight() {
    alert('Go night!');
}

function goKids() {
    alert('Go kids!');
}

function goHistorical() {
    alert('Go historical!');
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

