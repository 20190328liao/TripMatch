using Microsoft.AspNetCore.Mvc;

namespace TripMatch.Controllers
{
    public class MatchController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }
    }
}
