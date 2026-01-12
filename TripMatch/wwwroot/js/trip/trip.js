$(document).ready(function () {

    $.get('/api/TripApi', function (data) {
        let content = '';
        data.forEach(item => {

            content += `    
            <div class="card col-md-4 mb-3">
                <div class="card-body">
                <h3 class="card-title">${item.title}</h3>
                <a href="/Trip/Edit/${item.id}" class="stretched-link"></a>
                </div>
             </div>`;
        });
        $('#trip-list').html(content);
    });  

  

});