using Microsoft.AspNetCore.Mvc;

namespace TripMatch.Controllers
{
    public class TripController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }

        public IActionResult Create()
        {
            return View();
        }

        // 這裡的 id 會對應到網址 /Trip/Edit/5 中的 5
        public IActionResult Edit(int id)
        {            
            return View(id);
        }
    }
}
