function sendRequest(url, method, data = null) {

    return new Promise((resolve, reject) => {

        $.ajax({
            url: url,
            type: method,
            contentType: "application/json",
            data: data ? JSON.stringify(data) : null,
            success: function (response) {
                resolve(response);
            },
            error: function (xhr, status, error) {
                if (xhr.status == 401) {
                    reject(new Error("Unauthorized access - please log in."));
                }

                let errorMessage = "伺服器發生錯誤";
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMessage = xhr.responseJSON.message;
                } else if (xhr.responseText) {
                    errorMessage = xhr.responseText;
                }
                console.error(`API Error [${method} ${url}]:`, error);
                reject(errorMessage);
            }
        });
    });
}

export const TripApi = {
    // 1. 取得行程詳情
    getDetail: (tripId) => {
        return sendRequest(`/api/TripApi/detail/${tripId}`, 'GET');
    },

    // 2. 加入一般景點
    addSpot: (dto) => {
        return sendRequest('/api/TripApi/AddSpotToTrip', 'POST', dto);
    },

    // 3. 加入住宿
    addAccommodation: (dto) => {
        return sendRequest('/api/TripApi/AddAccommodation', 'POST', dto);
    },

    // 4. 刪除景點
    deleteSpot: (id) => {
        return sendRequest(`/api/TripApi/DeleteSpotFromTrip/${id}`, 'DELETE');
    },

    // 5. 刪除住宿
    deleteAccommodation: (id) => {
        return sendRequest(`/api/TripApi/DeleteAccommodation/${id}`, 'DELETE');
    },

    // 6. 更新時間
    updateSpotTime: (dto) => {
        return sendRequest('/api/TripApi/UpdateSpotTime', 'POST', dto);
    },

    // 7. 儲存快照
    addSnapshot: (dto) => {
        return sendRequest('/api/TripApi/AddSnapshot', 'POST', dto);
    },

    // 8. 願望清單
    updateWishList: (dto) => {
        return sendRequest('/api/TripApi/UpdateWishList', 'POST', dto);
    },

    checkIsWishlist: (spotId) => {
        return sendRequest('/api/TripApi/CheckIsWishlist', 'POST', spotId);
    }
};