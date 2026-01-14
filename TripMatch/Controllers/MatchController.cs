using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TripMatch.Controllers
{
    [Authorize]
    public class MatchController : Controller
    {
        [HttpGet]
        public IActionResult Index()
        {
            return View();
        }

        [HttpGet("Preferences/{groupId}")]
        public IActionResult Preferences(int groupId)
        {
            ViewBag.GroupId = groupId;
            return View();
        }
    }
}
