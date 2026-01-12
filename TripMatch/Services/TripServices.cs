using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TripMatch.Models;
using TripMatch.Models.DTOs;
using TripMatch.Services.ExternalClients;

namespace TripMatch.Services
{
    public class TripServices
    {

        private readonly TravelDbContext _context;

        private readonly GooglePlacesClient _googlePlacesClient;

        public TripServices(TravelDbContext context, GooglePlacesClient googlePlacesClient)
        {
            _context = context;
            _googlePlacesClient = googlePlacesClient;
        }

        public async Task<List<TripSimpleDto>> GetTrips()
        {
            List<TripSimpleDto> tripDtos = [];


            var trips = await _context.Trips.ToListAsync();

            foreach (var trip in trips)
            {
                TripSimpleDto tripDto = new()
                {
                    Id = trip.Id,   
                    Title = trip.Title,
                };
                tripDtos.Add(tripDto);
            }
            return tripDtos;
        }

        public async Task<bool> isPlaceInWishlist(string placeId)
        {
            await Task.Yield(); // 這行確保方法為真正的 async
            return true;
        }

        public async Task<int> AddTrip(TripCreateDto tripDto)
        {
            Trip trip = new Trip()
            {
                Title = tripDto.Title,
                StartDate = tripDto.StartDate,
                EndDate = tripDto.EndDate,
                InviteCode = Guid.NewGuid(),
                CreatedAt = DateTimeOffset.Now,
                UpdatedAt = DateTimeOffset.Now
            };
            _context.Trips.Add(trip);
            await _context.SaveChangesAsync();

            // 確保 GlobalRegions 資料表有相關國家/地區的資料
            await AddTripRegions(trip.Id, tripDto.PlaceIds);


            return trip.Id;

        }

        // 新增感興趣的國家/地區到 GlobalRegions 資料表   
        private async Task<List<int>> AddGlobalRegionIfNotExists(String[] PlaceIds)
        {
            List<int> globalRegionsId = new List<int>();
            foreach (var placeID in PlaceIds)
            {
                // 先判斷資料庫是否有相同資料
                GlobalRegion? existingRegion = await _context.GlobalRegions
                    .FirstOrDefaultAsync(gr => gr.PlaceId == placeID);  

                if (existingRegion!=null)
                {
                    globalRegionsId.Add(existingRegion.Id);
                    continue;
                }

                // 透過Google Places API 補全 GlobalRegion 資料
                // 中文資料
                var task_zh = _googlePlacesClient.GetPlaceDetailsAsync(placeID, "zh-TW");

                // 英文資料
                var task_en = _googlePlacesClient.GetPlaceDetailsAsync(placeID, "en");

                await Task.WhenAll(task_zh, task_en);

                var dto_zh = await task_zh;
                var dto_en = await task_en;

                if (dto_zh != null)
                {
                    GlobalRegion globalRegion = new GlobalRegion()
                    {
                        Name = dto_zh.Result.Name,
                        NameEn = dto_en != null ? dto_en.Result.Name : dto_zh.Result.Name,
                        Level = dto_zh.Result.Types.Contains("country") ? 1 : 2,
                        ParentId = null, // 先不處理父層關係    
                        PlaceId = placeID,
                        CountryCode = dto_zh.Result.AddressComponents?.FirstOrDefault(c => c.Types.Contains("country"))?.ShortName ?? "??",
                        IsHot = true,
                    };
                    _context.GlobalRegions.Add(globalRegion);
                    await _context.SaveChangesAsync();

                    globalRegionsId.Add(globalRegion.Id);   
                }               
            }
            return globalRegionsId;

        }

        private async Task AddTripRegions(int tripId, string[] PlaceIds)
        {
            List<int> globalRegionIds  = await AddGlobalRegionIfNotExists(PlaceIds);

            foreach (int regionId in globalRegionIds)
            {

                if (await _context.TripRegions.AnyAsync(tr => tr.TripId == tripId && tr.RegionId == regionId))
                    continue;

                TripRegion tripRegion = new ()
                {
                    TripId = tripId,
                    RegionId = regionId,
                };
                _context.TripRegions.Add(tripRegion);
            }

            await _context.SaveChangesAsync();
        }





    }
}
