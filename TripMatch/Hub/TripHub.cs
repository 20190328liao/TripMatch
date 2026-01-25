using Microsoft.AspNetCore.SignalR;

namespace TripMatch.Hubs
{
    public class TripHub : Hub
    {
        // 當前端連線成功後，會呼叫此方法將自己加入「行程房間」
        // 這樣更新訊息才不會發給正在看「其他行程」的人
        public async Task JoinTripGroup(string tripId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, tripId);
            Console.WriteLine($"使用者 {Context.ConnectionId} 已加入行程群組: {tripId}");
        }

        // 通知群組內的其他人，但不包含發送者自己
        public async Task NotifyUpdate(string tripId, int targetId)
        {
            // OthersInGroup 會自動排除目前連線的 ConnectionID
            await Clients.OthersInGroup(tripId).SendAsync("ReceiveItineraryUpdate", new
            {
                message = "有成員更新了行程時間",
                targetId = targetId
            });
        }
    }
}