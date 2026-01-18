using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Threading.Tasks;
using TripMatch.Models;
using TripMatch.Services;

namespace TripMatch.Controllers
{

    public class TripController : Controller
    {
        private readonly ILogger<HomeController> _logger;
        private readonly ITagUserId _tagUserId;
        private readonly TripServices _tripServices;
        public TripController(ILogger<HomeController> logger, ITagUserId tagUserId, TripServices tripServices)
        {
            _logger = logger;
            _tagUserId = tagUserId;
            _tripServices = tripServices;
        }

        [Authorize]
        public async Task<IActionResult> Index()
        {

            var user = _tagUserId.UserId;
            ViewBag.TaggedUserId = user;
            var vm = await _tripServices.GetMyTripsAsync(user);
            return View(vm);
        }

        public IActionResult Create()
        {
            return View();
        }

        public IActionResult Edit(int id)
        {
            return View(id);
        }
    }
}
