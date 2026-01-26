let connection = null;  

export const SignalRManager = {

    //1. 初始化連線
    init: async (tripId, onUpdateReceived) => {

        if (connection) return; // 已經初始化過了

        connection = new signalR.HubConnectionBuilder()
            .withUrl("/tripHub")
            .withAutomaticReconnect([0, 2000, 10000, 30000])
            .build();

        // 監聽後端廣播
        connection.on("ReceiveItineraryUpdate", (data) => {
            if (onUpdateReceived) onUpdateReceived(data);
        });

        try {
            await connection.start();
            await connection.invoke("JoinTripGroup", tripId.toString());

            // 處理 Edge 或行動版瀏覽器重連後遺失群組的問題
            connection.onreconnected(async () => {
                await connection.invoke("JoinTripGroup", tripId.toString());
            });
            console.log("SignalR 連線成功並加入群組:", tripId);
        } catch (err) {
            console.error("SignalR 啟動失敗:", err);
        }       
    },

     // 2. 統一發送廣播 (由發送者呼叫)
    broadcast: (tripId, description, targetId = 0) => {
        if (connection && connection.state === signalR.HubConnectionState.Connected) {
            const message = `有成員${description}`;
            // 確保 targetId 是整數
            connection.invoke("NotifyUpdate", tripId.toString(), parseInt(targetId), message)
                .catch(err => console.error("廣播失敗:", err));
        }
    }

}
