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

        public async Task<TripSimpleDto> GetTripSimple(int tripId)
        {
            TripSimpleDto tripSimpleDto = new();

            var trip = await _context.Trips
                .FirstOrDefaultAsync(t => t.Id == tripId);

            var tripRegionDetail = await _context.GlobalRegions
                .Where(gr => gr.TripRegions.Any(tr => tr.TripId == tripId)).ToListAsync();

            if (trip != null)
            {
                tripSimpleDto.Id = trip.Id;
                tripSimpleDto.Title = trip.Title;
                tripSimpleDto.StartDate = trip.StartDate;
                tripSimpleDto.EndDate = trip.EndDate;
                tripSimpleDto.Lat = tripRegionDetail[0].Lat;
                tripSimpleDto.Lng = tripRegionDetail[0].Lng;
            }
            return tripSimpleDto;
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
                RoleType = 1, // Owner   
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
                        Lat = dto_zh.Result.Geometry.Location.Lat,
                        Lng = dto_zh.Result.Geometry.Location.Lng,
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

        #region 行程編輯相關

        //取得所有行程資料
        public async Task<TripDetailDto> GetTripDetail(int tripId)
        {
            TripDetailDto tripDetailDto = new();
            //先取得行程基本資料 

            // 只需一個 await，資料庫會執行一次 JOIN 查詢
            var trip = await _context.Trips
                .Include(t => t.ItineraryItems) // 一併抓出該行程的所有明細
                .FirstOrDefaultAsync(t => t.Id == tripId);

            // 回傳空的 DTO
            if (trip == null)
                return tripDetailDto;


            // 填寫tripInfo
            tripDetailDto.TripInfo = new TripSimpleDto
            {
                Id = trip.Id,
                Title = trip.Title,
                StartDate = trip.StartDate,
                EndDate = trip.EndDate
            };


            // 如果行程存在，我們直接從 trip 中提取並排序明細
            // 這是在記憶體中進行的，非常快
            var itineraryItems = trip.ItineraryItems
                .OrderBy(item => item.DayNumber)
                .ThenBy(item => item.SortOrder)
                .ToList() ?? [];

            // 填充行程景點資料
            foreach (var item in itineraryItems)
            {
                if (item.SpotId == null)
                    continue; // 跳過沒有景點快照的項目


                //取得景點資訊(名稱, 地址, 照片...)
                var placesSnapshot = await _context.PlacesSnapshots.FirstOrDefaultAsync(sp => sp.SpotId == item.SpotId);
                SpotProfileDto spotProfile;

                if (placesSnapshot != null)
                {
                    // 1. 先宣告預設值為空字串
                    string firstPhotoUrl = "";

                    // 2. 嘗試反序列化 (包含防呆)
                    if (!string.IsNullOrWhiteSpace(placesSnapshot.PhotosSnapshot))
                    {
                        try
                        {
                            // 假設 JSON 格式是 ["url1", "url2"...]
                            var photos = System.Text.Json.JsonSerializer.Deserialize<List<string>>(placesSnapshot.PhotosSnapshot);

                            // 取第一筆，如果 list 為 null 或空，則給空字串
                            firstPhotoUrl = photos?.FirstOrDefault() ?? "";
                        }
                        catch
                        {
                            // 如果 JSON 格式錯誤 (例如 parse 失敗)，維持空字串，不讓程式崩潰
                            firstPhotoUrl = "";
                        }
                    }

                    spotProfile = new SpotProfileDto()
                    {
                        PlaceId = placesSnapshot.ExternalPlaceId ?? "",
                        Name_ZH = placesSnapshot.NameEn ?? "",
                        Address = placesSnapshot.AddressSnapshot ?? "",
                        PhotoUrl = firstPhotoUrl,
                        Lat = placesSnapshot.Lat,
                        Lng = placesSnapshot.Lng,
                        Rating = placesSnapshot.Rating ?? 0
                    };
                }
                else
                {
                    // 若找不到快照資料, 要給預設
                    // 前端後續要想辦法把place id 傳過來，不然只有spot id也沒有用
                    spotProfile = new SpotProfileDto()
                    {
                        PlaceId = "",
                        Name_ZH = "未知景點",
                        Address = "未知地址",
                        PhotoUrl = "",
                        Lat = 0,
                        Lng = 0,
                        Rating = 0
                    };
                }


                ItineraryItemDto itemDto = new()
                {
                    Id = item.Id,
                    TripId = item.TripId,
                    SpotId = (int)item.SpotId,
                    DayNumber = item.DayNumber,
                    StartTime = item.StartTime ?? new TimeOnly(0, 0),
                    EndTime = item.EndTime ?? new TimeOnly(0, 0),
                    SortOrder = item.SortOrder,
                    Profile = spotProfile

                };
                tripDetailDto.ItineraryItems.Add(itemDto);
            }

            return tripDetailDto;

        }


        public async Task<bool> AddAccommodation(int? userId, AccomadationDto dto)
        {
            return true;
        }




        // 嘗試新增景點到行程
        public async Task<bool> TryAddSpotToTrip(int? userId, ItineraryItemDto dto)
        {
            // 1. 自動計算 SortOrder (取得該行程當天目前的最高序號 + 1)
            int nextSortOrder = await _context.ItineraryItems
                .Where(x => x.TripId == dto.TripId && x.DayNumber == dto.DayNumber)
                .Select(x => (int?)x.SortOrder) // 使用 int? 預防當天還沒資料的情況
                .MaxAsync() ?? 0;

            ItineraryItem item = new()
            {
                UpdatedByUserId = userId,
                TripId = dto.TripId,
                SpotId = dto.SpotId,
                DayNumber = dto.DayNumber,
                StartTime = dto.StartTime,
                EndTime = dto.EndTime,
                SortOrder = nextSortOrder + 1,
                ItemType = 1,
                IsOpened = true,
                CreatedAt = DateTimeOffset.Now,
                UpdatedAt = DateTimeOffset.Now
            };

            try
            {
                _context.ItineraryItems.Add(item);
                await _context.SaveChangesAsync();
                return true;
            }
            catch (Exception)
            {
                // 這裡可以 Log 錯誤原因
                return false;
            }
        }

        // 將景點自行程中刪除
        public async Task<bool> DeleteSpotFromTrip(int Id)
        {
            var existing = await _context.ItineraryItems
                    .FirstOrDefaultAsync(It => It.Id == Id);
            if (existing != null)
            {
                _context.ItineraryItems.Remove(existing);
                await _context.SaveChangesAsync();
                return true;
            }
            else
            {
                return false;
            }
        }

        public async Task<bool> UpdateSpotTime(SpotTimeDto Dto)
        {
            if (Dto.Id <=0)
                return false;
           
            var existing = await _context.ItineraryItems
                    .FirstOrDefaultAsync(It => It.Id == Dto.Id);

            if (existing != null)
            {
                existing.StartTime = Dto.StartTime;
                existing.EndTime = Dto.EndTime;
                await _context.SaveChangesAsync();
                return true;
            }
            return false;
        }


        #endregion

        #region 景點快照與願望清單

        // 嘗試新增景點快照，若已存在則回傳既有的 SpotId
        public async Task<int> TryAddPlaceSnapshot(PlaceSnapshotDto Dto)
        {
            // 1. 先嘗試找出該筆資料
            var existingPlace = await _context.PlacesSnapshots
                .FirstOrDefaultAsync(ps => ps.ExternalPlaceId == Dto.ExternalPlaceId);

            // 2. 如果資料已存在，直接回傳 ID
            if (existingPlace != null)
            {
                return existingPlace.SpotId;
            }

            PlacesSnapshot obj = new()
            {
                ExternalPlaceId = Dto.ExternalPlaceId,
                NameZh = Dto.NameZh,
                NameEn = Dto.NameEn,
                LocationCategoryId = _sharedService.GetLocationCategoryId(Dto.LocationCategory),
                AddressSnapshot = Dto.Address,
                Lat = Dto.Lat,
                Lng = Dto.Lng,
                Rating = Dto.Rating,
                UserRatingsTotal = Dto.UserRatingsTotal,
                PhotosSnapshot = JsonSerializer.Serialize(Dto.PhotosSnapshot),
                CreatedAt = DateTimeOffset.Now,
                UpdatedAt = DateTimeOffset.Now
            };

            try
            {
                _context.PlacesSnapshots.Add(obj);
                await _context.SaveChangesAsync();
                return obj.SpotId;
            }
            catch (DbUpdateException) // 3. 捕捉併發導致的唯一索引衝突
            {
                // 4. 當 SaveChanges 失敗，表示另一個請求剛好捷足先登寫入了
                // 此時資料庫已經有這筆資料了，我們再次查詢並取回它的 ID
                var reFetchedPlace = await _context.PlacesSnapshots
                    .AsNoTracking() // 建議用 NoTracking，因為剛才 Add 失敗的物件可能還在追蹤中
                    .FirstOrDefaultAsync(ps => ps.ExternalPlaceId == Dto.ExternalPlaceId);

                return reFetchedPlace?.SpotId ?? -1;
            }
        }

        // 檢查景點是否在使用者的願望清單中 
        public async Task<bool> IsInWishList(int? userId, int spotId)
        {
            if (userId == null)
                return false;
            var existing = await _context.Wishlists
                .FirstOrDefaultAsync(w => w.UserId == userId && w.SpotId == spotId);

            if (existing != null)
                return true;
            else
                return false;
        }

        public async Task<bool> UpdateWishList(int? userId, int spotId, bool AddToWishlist)
        {
            if (userId == null)
                return false;

            if (AddToWishlist)
            {
                // 檢查是否已存在
                var existing = await _context.Wishlists
                    .FirstOrDefaultAsync(w => w.UserId == userId && w.SpotId == spotId);
                if (existing != null)
                    return true;

                Wishlist wishlist = new()
                {
                    UserId = (int)userId,
                    SpotId = spotId,
                    Note = "",
                    CreatedAt = DateTimeOffset.Now,
                    UpdatedAt = DateTimeOffset.Now
                };
                _context.Wishlists.Add(wishlist);
                await _context.SaveChangesAsync();
                return true;
            }
            else
            {
                var existing = await _context.Wishlists
                    .FirstOrDefaultAsync(w => w.UserId == userId && w.SpotId == spotId);
                if (existing != null)
                {
                    _context.Wishlists.Remove(existing);
                    await _context.SaveChangesAsync();
                }
                return true;
            }
        }

        #endregion

        #region 我的行程主頁

        // 抓我自己的行程
        public async Task<MyTripsDto> GetMyTripsAsync(int? userId = null)
        {
            var trips = await _context.TripMembers
                .AsNoTracking()
                .Where(tm => tm.UserId == userId)
                .OrderByDescending(tm => tm.Trip.StartDate)
                .Select(tm => new TripCardDto
                {
                    TripId = tm.Trip.Id,
                    Title = tm.Trip.Title,
                    StartDate = tm.Trip.StartDate,
                    EndDate = tm.Trip.EndDate,
                    CoverImageUrl = string.IsNullOrWhiteSpace(tm.Trip.CoverImageUrl) ? $"https://picsum.photos/seed/trip-{tm.Trip.Id}/800/400" : tm.Trip.CoverImageUrl,
                    IsOwner = (tm.RoleType == 1),                   
                    DetailsUrl = $"/Trip/Edit?id={tm.TripId}",
                    MembersUrl = $"/Trip/Members?tripId={tm.Trip.Id}",
                })
                .ToListAsync();
            return new MyTripsDto { Trips = trips };
        }

        // return 成員名單
        public async Task<List<TripMemberDto>> GetMembersAsync(int userId, int tripId)
        {
            // 只有成員能查看
            var isMember = await _context.TripMembers
                .AsNoTracking()
                .AnyAsync(x => x.TripId == tripId &&  x.UserId == userId);

            if (!isMember) throw new UnauthorizedAccessException("Not a trip member.");

            // 搜尋該行程的所有成員
            var members = await _context.TripMembers
                .AsNoTracking()
                .Where(x => x.TripId == tripId)
                .OrderBy(x => x.RoleType)
                .Select(x => new TripMemberDto
                {
                    UserId = x.UserId,
                    RoleType = x.RoleType,
                    DisplayName = x.User.FullName ?? $"User#{x.UserId}" 
                })
                .ToListAsync();
            return members;
        }

        // 刪除行程
        public async Task DeleteTripAsync(int userId, int tripId)
        {
            // 只允許 owner 刪除
            var myRole = await _context.TripMembers
                .Where(x => x.TripId == tripId && x.UserId == userId)
                .Select(x => (byte?)x.RoleType)
                .FirstOrDefaultAsync();

            if (myRole is null) throw new UnauthorizedAccessException("Not a trip member.");
            if (myRole != 1) throw new UnauthorizedAccessException("Only owner can delete.");

            // 刪除策略:
            // -> 若 DB 有 cascade，直接刪 Trip
            // -> 若沒有 cascade，需先刪 TripMembers/關聯表，再刪 Trip
            var trip = await _context.Trips.FindAsync(tripId);
            if (trip == null) return;

            _context.Trips.Remove(trip);
            await _context.SaveChangesAsync();
        }

        // 離開行程
        public async Task LeaveTripAsync(int userId, int tripId)
        {
            var tm = await _context.TripMembers
                .FirstOrDefaultAsync(x => x.TripId == tripId && x.UserId == userId);

            if (tm == null) return;

            // owner 不允許直接 leave
            if (tm.RoleType == 1) throw new InvalidCastException("Owner cannot leave.");

            _context.TripMembers.Remove(tm);
            await _context.SaveChangesAsync();
        }

        #endregion




    }
}
