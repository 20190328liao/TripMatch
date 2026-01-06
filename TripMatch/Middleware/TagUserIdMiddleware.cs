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

        public async Task InvokeAsync(HttpContext context, ITagUserId tagUserId)
        {
            if (context.User.Identity?.IsAuthenticated == true)
            {
                var userIdStr = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                             ?? context.User.FindFirst("sub")?.Value;
                if (int.TryParse(userIdStr, out var userId))
                {
                    tagUserId.Set(userId);
                }
            }
            await _next(context);
        }
    }
}
