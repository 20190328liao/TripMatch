

const tripId = document.getElementById('current-trip-id').value; // 取得行程編號

export function initEditPage() {
    
    //載入行程資料
    //取得每天的行程細節，從API取得的資料應包含每天(ItineraryItem)
  
}

function loadTripData(tripId) {

    $.get(`/api/TripApi/${tripId}`, function (data) {

        console.log(data);

    });
}

function renderItinerary(itineraryItmes) {



}
