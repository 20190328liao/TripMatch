using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using TripMatch.Services;

namespace TripMatch.Middleware
{
    public class TagUserIdMiddleware
    {
        

            private readonly RequestDelegate _next;

            public TagUserIdMiddleware(RequestDelegate next)
            {
                _next = next;
            }

            public async Task InvokeAsync(HttpContext context, TagUserId tagUserId)
            {
                // 以 ClaimTypes.NameIdentifier 為準
                var userId = context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
                if (!string.IsNullOrEmpty(userId))
                {
                    // 放到 HttpContext.Items，方便中間層或外部直接讀取
                    context.Items["TaggedUserId"] = userId;

                    // 並寫入注入的 accessor（Scoped）
                    tagUserId?.Set(userId);
                }

                await _next(context);
            }

}
}
