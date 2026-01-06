using System.Security.Claims;

namespace TripMatch.Extensions
{
    public static class HttpContextExtensions
    {
        // 優先從 Items["TaggedUserId"] 取得，fallback 讀 Claims
        public static string? GetTaggedUserId(this HttpContext context)
        {
            if (context == null) return null;

            if (context.Items.TryGetValue("TaggedUserId", out var val) && val is string s && !string.IsNullOrEmpty(s))
            {
                return s;
            }

            return context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        }
    }
}
