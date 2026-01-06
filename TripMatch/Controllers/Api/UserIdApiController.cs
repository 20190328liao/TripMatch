using Microsoft.AspNetCore.Mvc;
using TripMatch.Services;
using TripMatch.Extensions;

namespace TripMatch.Controllers.Api
{
    [ApiController]
    [Route("api/[controller]")]
    public class UserIdApiController : ControllerBase
    {
        private readonly ITagUserId _tag;

        public UserIdApiController(ITagUserId tag)
        {
            _tag = tag;
        }

        [HttpGet("whoami")]
        public IActionResult WhoAmI()
        {
            // 優先使用注入的 TagUserId，若為 null 可 fallback HttpContext extension
            var userId = _tag.UserId ?? HttpContext.GetTaggedUserId();
            return Ok(new { userId });
        }
    }
}
