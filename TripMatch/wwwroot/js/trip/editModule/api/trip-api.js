import { SignalRManager } from '../signalr-manager.js';

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

const AIRLABS_KEY = "34aaa904-fced-4a04-9f6c-2501c6e0ded0";

export const TripApi = {
    // 取得行程詳情
    getDetail: (tripId) => {
        return sendRequest(`/api/TripApi/detail/${tripId}`, 'GET');
    },

    // 加入景點
    addSpot: (dto) => {
        return sendRequest('/api/TripApi/AddSpotToTrip', 'POST', dto);
    },

    // 刪除景點
    deleteSpot: (id) => {
        return sendRequest(`/api/TripApi/DeleteSpotFromTrip/${id}`, 'DELETE');
    },

    // 更新景點時間
    updateSpotTime: (dto) => {
        return sendRequest('/api/TripApi/UpdateSpotTime', 'POST', dto);
    },

    // [修改] 1. 搜尋航線 (改呼叫後端 Proxy)
    searchFlightRoute: (depIata, arrIata) => {
        // 呼叫自己的後端 API
        const url = `/api/TripApi/ProxyFlightRoutes?depIata=${depIata}&arrIata=${arrIata}`;
        return $.get(url);
    },

    // [修改] 2. 搜尋航班詳細 (改呼叫後端 Proxy)
    searchFlightDetail: (flightIata) => {
        // 呼叫自己的後端 API
        const url = `/api/TripApi/ProxyFlightDetail?flightIata=${flightIata}`;
        return $.get(url);
    },

    // 新增航班
    addFlight: async (dto) => {
        const res = await sendRequest('/api/TripApi/AddFlight', 'POST', dto);
        SignalRManager.broadcast(dto.tripId, "新增了航班", res.id);
        return res;
    },

    // 刪除航班
    deleteFlight: async (tripId, id, rowVersion) => {
        const url = `/api/TripApi/DeleteFlight/${id}?rowVersion=${encodeURIComponent(rowVersion)}`;
        const res = await sendRequest(url, 'DELETE');
        SignalRManager.broadcast(tripId, "刪除了航班", 0);

        return res;
    },

    // 加入住宿
    addAccommodation: (dto) => {
        return sendRequest('/api/TripApi/AddAccommodation', 'POST', dto);
    },    

    deleteAccommodation: (id, rowVersion) => {
        const url = `/api/TripApi/DeleteAccommodation/${id}?rowVersion=${encodeURIComponent(rowVersion)}`;
        return sendRequest(url, 'DELETE');
    },

    // 儲存快照
    addSnapshot: (dto) => {
        return sendRequest('/api/TripApi/AddSnapshot', 'POST', dto);
    },

    // 願望清單
    updateWishList: (dto) => {
        return sendRequest('/api/TripApi/UpdateWishList', 'POST', dto);
    },

    // 檢查是否在願望清單中
    checkIsWishlist: (spotId) => {
        return sendRequest('/api/TripApi/CheckIsWishlist', 'POST', spotId);
    }
};