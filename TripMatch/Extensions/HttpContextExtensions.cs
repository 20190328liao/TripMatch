using System.Security.Claims;
using Microsoft.AspNetCore.Http;

namespace TripMatch.Extensions
{
    public static class HttpContextExtensions
    {
        // 優先從 Items["TaggedUserId"] 取得，fallback 讀 Claims（並嘗試轉為 int）
        public static int? GetTaggedUserId(this HttpContext context)
        {
            if (context == null) return null;

            if (context.Items.TryGetValue("TaggedUserId", out var val))
            {
                if (val is int i) return i;
                if (val is string s && int.TryParse(s, out var parsed)) return parsed;
            }

            var claim = context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!string.IsNullOrEmpty(claim) && int.TryParse(claim, out var c)) return c;

            return null;
        }
    }
}
