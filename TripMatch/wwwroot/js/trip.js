$(document).ready(function () {
    $.get('/api/TripApi', function (data) {
        let content = '';
        data.forEach(item => {
            content += `<div class="card col-4">
                            <h3>${item.tripName}</h3>
                            <p>${item.locationName}</p>
                        </div>`;
        });
        $('#trip-list').html(content);
    });
});