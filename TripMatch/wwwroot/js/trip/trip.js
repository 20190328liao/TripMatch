$(document).ready(function () {

    $.get('/api/TripApi', function (data) {
        let content = '';
        data.forEach(item => {

            content += `<div class="card col-4">
                            <h3>${item.title}</h3>                           
                        </div>`;
        });
        $('#trip-list').html(content);
    });  

  

});