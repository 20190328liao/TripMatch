using Microsoft.AspNetCore.Mvc;

namespace TripMatch.Controllers
{
    public class SpotController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }
    }
}
