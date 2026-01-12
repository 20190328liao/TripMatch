using System.Diagnostics;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace TripMatch.Middleware
{
    public class RequestTimingMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<RequestTimingMiddleware> _logger;

        public RequestTimingMiddleware(RequestDelegate next, ILogger<RequestTimingMiddleware> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            var path = context.Request.Path.Value ?? string.Empty;

            // 只針對登入/驗證相關路徑（可根據需要擴充）
            if (path.StartsWith("/Auth", System.StringComparison.OrdinalIgnoreCase) ||
                path.StartsWith("/api/auth", System.StringComparison.OrdinalIgnoreCase) ||
                path.Contains("/Signin", System.StringComparison.OrdinalIgnoreCase))
            {
                var sw = Stopwatch.StartNew();
                await _next(context);
                sw.Stop();

                _logger.LogInformation("RequestTiming: {Method} {Path} responded {StatusCode} in {ElapsedMs} ms",
                    context.Request.Method, path, context.Response.StatusCode, sw.ElapsedMilliseconds);
            }
            else
            {
                await _next(context);
            }
        }
    }
}
