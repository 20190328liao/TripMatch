using Microsoft.AspNetCore.Mvc;

namespace TripMatch.Controllers
{
    public class TripController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }

        public IActionResult CreateTrip()
        {
            return View();
        }

        [HttpPost]
        public IActionResult EditTrip()
        {
            return View();
        }
    }
}
