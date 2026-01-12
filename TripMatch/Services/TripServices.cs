using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using TripMatch.Models;
using TripMatch.Models.DTOs;
using TripMatch.Services.Common;
using TripMatch.Services.ExternalClients;


namespace TripMatch.Services
{
    public class TripServices
    {

        private readonly TravelDbContext _context;

        private readonly GooglePlacesClient _googlePlacesClient;

        private readonly SharedService _sharedService;

        public TripServices(TravelDbContext context, SharedService sharedService, GooglePlacesClient googlePlacesClient)
        {
            _context = context;
            _sharedService = sharedService;
            _googlePlacesClient = googlePlacesClient;
        }

        #region 行程資訊
        // 取得所有行程列表 (簡易資訊)
        public async Task<List<TripSimpleDto>> GetTrips(int? userId)
        {
            List<TripSimpleDto> tripDtos = [];

            List<Trip> trips = await _context.Trips.Where(t => t.TripMembers.Any(tm => tm.UserId == userId)).ToListAsync();

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

        public async Task<TripDetailDto> GetTripDetail(int tripId)
        {
         
            return tripDto;
        }

        #endregion

        #region 建立行程    
        public async Task<int> AddTrip(int? userId, TripCreateDto tripDto)
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


            // 建立行程成員 (預設建立者為行程成員)
            TripMember tripMember = new TripMember
            {
                TripId = trip.Id,
                UserId = userId is not null ? userId.Value : 0,
                RoleType= 1, // Owner   
                JoinedAt = DateTimeOffset.Now
            };
            _context.TripMembers.Add(tripMember);
            await _context.SaveChangesAsync();

            // 建立行程感興趣的區域
            await AddTripRegions(trip.Id, tripDto.PlaceIds);


            return trip.Id;

        }

        // 建立行程感興趣的區域
        private async Task AddTripRegions(int tripId, string[] PlaceIds)
        {
            List<int> globalRegionIds = await AddGlobalRegionIfNotExists(PlaceIds);

            foreach (int regionId in globalRegionIds)
            {

                if (await _context.TripRegions.AnyAsync(tr => tr.TripId == tripId && tr.RegionId == regionId))
                    continue;

                TripRegion tripRegion = new()
                {
                    TripId = tripId,
                    RegionId = regionId,
                };
                _context.TripRegions.Add(tripRegion);
            }

            await _context.SaveChangesAsync();
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

                if (existingRegion != null)
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

        #endregion

        #region 景點快照與願望清單

        public async Task<bool> TryAddPlaceSnapshot(PlaceSnapshotDto dto)
        {
            bool isExist = await _context.PlacesSnapshots.AnyAsync(ps => ps.ExternalPlaceId == dto.ExternalPlaceId);
            if (isExist == false)
            {
                PlacesSnapshot obj = new()
                {
                    ExternalPlaceId = dto.ExternalPlaceId,
                    NameZh = dto.NameZh,
                    NameEn = dto.NameEn,
                    LocationCategoryId = _sharedService.GetLocationCategoryId(dto.LocationCategory),
                    AddressSnapshot = dto.Address,
                    Lat = dto.Lat,
                    Lng = dto.Lng,
                    Rating = dto.Rating,
                    UserRatingsTotal = dto.UserRatingsTotal,
                    PhotosSnapshot = JsonSerializer.Serialize(dto.PhotosSnapshot),
                    CreatedAt = DateTimeOffset.Now,
                    UpdatedAt = DateTimeOffset.Now
                };

                _context.PlacesSnapshots.Add(obj);
                await _context.SaveChangesAsync();
                return true;
            }
            return false;
        }

        public async Task<bool> isPlaceInWishlist(int userID, string placeId)
        {
            return true;
        }




        #endregion









    }
}
