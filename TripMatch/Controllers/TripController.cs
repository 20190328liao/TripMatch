using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TripMatch.Services;

namespace TripMatch.Controllers
{

    public class TripController : Controller
    {
        private readonly ILogger<HomeController> _logger;
        private readonly ITagUserId _tagUserId; 
        public TripController(ILogger<HomeController> logger, ITagUserId tagUserId)
        {
            _logger = logger;
            _tagUserId = tagUserId;
        }

        [Authorize]
        public IActionResult Index()
        {
            return View();
        }

        public IActionResult Create()
        {
            return View();
        }

         public IActionResult Edit()
        {            
            return View();
        }
    }
}
