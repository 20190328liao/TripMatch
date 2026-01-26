using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using TripMatch.Services;

namespace TripMatch.Filters
{
    public class TripMemberAuthorizeAttribute : TypeFilterAttribute
    {
        // 繼承 TypeFilterAttribute，這讓 Filter 支援相依性注入 (DI)
        public TripMemberAuthorizeAttribute() : base(typeof(TripMemberFilter))
        {
        }

        private class TripMemberFilter : IAsyncActionFilter
        {
            private readonly TripServices _tripServices;
            private readonly ITagUserId _tagUserId;

            public TripMemberFilter(TripServices tripServices, ITagUserId tagUserId)
            {
                _tripServices = tripServices;
                _tagUserId = tagUserId;
            }

            public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
            {
                // 1. 從 Action 參數中抓取名為 "id" 的值 (對應 Edit(int id))
                if (context.ActionArguments.TryGetValue("id", out var objId) && objId is int tripId)
                {
                    var userId = _tagUserId.UserId;

                    // 2. 呼叫 Service 檢查權限
                    bool isMember = await _tripServices.IsUserTripMember(userId, tripId);

                    if (!isMember)
                    {
                        // 取得 Controller 實例以存取 TempData
                        if (context.Controller is Controller controller)
                        {
                            controller.TempData["UnauthorizedMessage"] = "您不屬於該行程成員，無法進入編輯頁面。";
                        }

                        // 3. 驗證失敗：回傳 404 (NotFound)，不讓非法使用者知道行程是否存在
                        context.Result = new RedirectToActionResult("Index", "Trip", null);
                        return;
                    }
                }

                // 驗證成功，繼續執行後續的 Action 邏輯
                await next();
            }
        }
    }
}