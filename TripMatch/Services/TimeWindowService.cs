using Microsoft.EntityFrameworkCore;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;
using TripMatch.Models;
using TripMatch.Models.DTOs.External;
using TripMatch.Models.DTOs.TimeWindow;

namespace TripMatch.Services
{
    public class TimeWindowService
    {
        private readonly TravelDbContext _context;
        private readonly TravelInfoService _travelInfoService;

        public TimeWindowService(TravelDbContext context, TravelInfoService travelInfoService)
        {
            _context = context;
            _travelInfoService = travelInfoService;
        }

        // 1. 建團 (團長開團)
        // 回傳: 建立好的 TravelGroup 物件
        public async Task<TravelGroup> CreateGroupAsync(int ownerUserId, CreateGroupRequest request)
        {
            var group = new TravelGroup
            {
                OwnerUserId = ownerUserId,
                InviteCode = GenerateInviteCode(),
                TargetNumber = request.TargetNumber,
                Title = request.Title,
                DepartFrom = request.DepartFrom,
                TravelDays = request.TravelDays,

                DateStart = request.DateStart?.ToDateTime(TimeOnly.MinValue) ?? DateTime.Today,
                DateEnd = request.DateEnd?.ToDateTime(TimeOnly.MinValue) ?? DateTime.Today.AddDays(30),
                Status = GroupStatus.PREF,
                CreatedAt = DateTime.Now,
                UpdateAt = DateTime.Now
            };

            _context.TravelGroups.Add(group);

            var member = new GroupMember
            {
                Group = group,
                UserId = ownerUserId,
                InviteCode = group.InviteCode,
                Role = "Owner",
                JoinedAt = DateTime.Now
            };
            _context.GroupMembers.Add(member);

            await _context.SaveChangesAsync();

            return group;
        }
        // 2. 加入群組 (成員加入)
        // 回傳: 加入的成員資訊
        public async Task<GroupMember> JoinGroupAsync(int userId, JoinGroupRequest request)
        {
            var group = await _context.TravelGroups
                .FirstOrDefaultAsync(g => g.InviteCode == request.InviteCode);

            if (group == null)
            {
                throw new Exception("找不到此邀請碼的群組");
            }

            var existingMember = await _context.GroupMembers
                .FirstOrDefaultAsync(m => m.GroupId == group.GroupId && m.UserId == userId);

            if (existingMember != null)
            {
                return existingMember;
            }

            var newMember = new GroupMember
            {
                GroupId = group.GroupId,
                UserId = userId,
                InviteCode = group.InviteCode,
                Role = "Member",
                JoinedAt = DateTime.Now
            };

            _context.GroupMembers.Add(newMember);
            await _context.SaveChangesAsync();

            var hasPreference = await _context.Preferences
            .AnyAsync(p => p.GroupId == group.GroupId && p.UserId == userId);

            if (!hasPreference)
            {
                _context.Preferences.Add(new Preference
                {
                    GroupId = group.GroupId,
                    UserId = userId,
                    CreatedAt = DateTime.Now
                });
                await _context.SaveChangesAsync();
            }

            return newMember;
        }

        // 輔助方法：產生邀請碼
        private string GenerateInviteCode()
        {
            const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            var random = new Random();
            return new string(Enumerable.Repeat(chars, 6)
                .Select(s => s[random.Next(s.Length)]).ToArray());
        }

        // 3. 取得群組狀態
        public async Task<object?> GetGroupStatusAsync(int groupId)
        {
            var group = await _context.TravelGroups
                .FirstOrDefaultAsync(g => g.GroupId == groupId);

            if (group == null) return null;

            var joinedCount = await _context.GroupMembers.CountAsync(m => m.GroupId == groupId);
            var submittedCount = await _context.GroupMembers.CountAsync(m => m.GroupId == groupId && m.SubmittedAt != null);

            return new
            {
                groupId = group.GroupId,
                inviteCode = group.InviteCode,
                targetNumber = group.TargetNumber,
                joinedCount = joinedCount,
                submittedCount = submittedCount,
                status = group.Status,
                travelDays = group.TravelDays
            };
        }

        // 4. 更新或新增旅遊偏好
        public async Task<Preference> UpsertPreferenceAsync(int groupId, int userId, UpsertPreferenceRequest request)
        {
            await ValidateMemberAccessAsync(groupId, userId, requireNotSubmitted: true);

            var pref = await _context.Preferences
                .FirstOrDefaultAsync(p => p.GroupId == groupId && p.UserId == userId);

            if (pref == null)
            {
                pref = new Preference
                {
                    GroupId = groupId,
                    UserId = userId,
                    CreatedAt = DateTime.Now
                };
                _context.Preferences.Add(pref);
            }

            pref.HotelBudget = request.HotelBudget;
            pref.HotelRating = request.HotelRating;
            pref.Tranfer = request.Transfer;
            pref.PlacesToGo = request.PlacesToGo;
            pref.TotalBudget = request.TotalBudget;

            await _context.SaveChangesAsync();
            // 嘗試推進Status
            await TryAdvanceStatusAsync(groupId);
            return pref;
        }

        // 5. 提交有空的時間 (Available Slots)
        public async Task SaveAvailabilityAsync(int groupId, int userId, List<AvailableSlotInput> slots)
        {
            // 1. 刪除舊資料：改用 MemberTimeSlots
            var oldRecords = _context.MemberTimeSlots
                .Where(x => x.GroupId == groupId && x.UserId == userId);

            _context.MemberTimeSlots.RemoveRange(oldRecords);

            // 2. 新增新資料
            var newRecords = slots.Select(slot => new MemberTimeSlot
            {
                GroupId = groupId,
                UserId = userId,
                StartAt = slot.StartAt,
                EndAt = slot.EndAt,
                CreatedAt = DateTime.Now
            });

            await _context.MemberTimeSlots.AddRangeAsync(newRecords);

            // ★★★ 關鍵修正：補上這段「更新提交狀態」的邏輯 ★★★
            var member = await _context.GroupMembers
                .FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == userId);

            if (member != null)
            {
                // 設定提交時間，這樣 Count(m => m.SubmittedAt != null) 才會抓到人
                member.SubmittedAt = DateTime.Now;

                // 如果你的系統允許重複修改，可以不鎖定；
                // 但通常「提交」後為了讓其他人能媒合，會視為已確認。
                _context.GroupMembers.Update(member);
            }
            // ★★★ 修正結束 ★★★

            await _context.SaveChangesAsync();
            // 嘗試推進Status
            await TryAdvanceStatusAsync(groupId);
        }

        // 6. 算出推薦的時間區段 (核心演算法)
        public async Task<List<CommonTimeRangeDto>> GetCommonTimeRangesAsync(int groupId)
        {
            var group = await _context.TravelGroups.FindAsync(groupId);
            if (group == null) return new List<CommonTimeRangeDto>();

            var targetCount = group.TargetNumber;
            var submittedCount = await _context.GroupMembers.CountAsync(m => m.GroupId == groupId && m.SubmittedAt != null);

            if (submittedCount == 0) return new List<CommonTimeRangeDto>();

            var slots = await _context.MemberTimeSlots
                .Where(s => s.GroupId == groupId)
                .ToListAsync();

            if (!slots.Any()) return new List<CommonTimeRangeDto>();

            int n = targetCount;
            int threshold = (n / 2) + 1;
            int minDays = group.TravelDays;

            var dayCount = new Dictionary<DateOnly, int>();
            var groupStart = DateOnly.FromDateTime(group.DateStart);
            var groupEnd = DateOnly.FromDateTime(group.DateEnd);

            foreach (var s in slots)
            {
                var sDate = DateOnly.FromDateTime(s.StartAt);
                var eDate = DateOnly.FromDateTime(s.EndAt);

                var slotStart = sDate < groupStart ? groupStart : sDate;
                var slotEnd = eDate > groupEnd ? groupEnd : eDate;

                if (slotStart > slotEnd) continue;

                for (var d = slotStart; d <= slotEnd; d = d.AddDays(1))
                {
                    if (dayCount.ContainsKey(d))
                        dayCount[d]++;
                    else
                        dayCount[d] = 1;
                }
            }

            var goodDays = dayCount.Where(kv => kv.Value >= threshold)
                                   .Select(kv => kv.Key)
                                   .OrderBy(d => d)
                                   .ToList();

            var ranges = new List<CommonTimeRangeDto>();

            for (int i = 0; i < goodDays.Count; i++)
            {
                var startDay = goodDays[i];
                int currentIdx = i;
                int minAttendance = dayCount[startDay];

                while (currentIdx + 1 < goodDays.Count &&
                       goodDays[currentIdx + 1] == goodDays[currentIdx].AddDays(1))
                {
                    currentIdx++;
                    var countOnThisDay = dayCount[goodDays[currentIdx]];
                    if (countOnThisDay < minAttendance) minAttendance = countOnThisDay;
                }

                var endDay = goodDays[currentIdx];
                int duration = endDay.DayNumber - startDay.DayNumber + 1;

                if (duration >= minDays)
                {
                    ranges.Add(new CommonTimeRangeDto(startDay, endDay, duration, minAttendance));
                }

                i = currentIdx;
            }

            return ranges;
        }

        // 7. 取得個人狀態 (前端用來顯示打勾或鎖定按鈕)
        public async Task<object> GetMyStatusAsync(int groupId, int userId)
        {
            var member = await _context.GroupMembers
                .FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == userId);

            if (member == null) return null; // 或拋出錯誤

            // 檢查各項資料是否已填寫
            var hasPreferences = await _context.Preferences.AnyAsync(p => p.GroupId == groupId && p.UserId == userId);
            var hasSelectedTimeRange = await _context.MemberTimeSlots.AnyAsync(t => t.GroupId == groupId && t.UserId == userId);

            // 是否已提交 (鎖定)
            var isSubmitted = member.SubmittedAt != null;

            return new
            {
                isMember = true,
                role = member.Role,
                hasPreferences,
                hasSelectedTimeRange,
                isSubmitted
            };
        }

        // 8. 方案卡
        public async Task<List<Recommendation>> GenerateRecommendationsAsync(int groupId)
        {
            // 1. 檢查是否已經有生成過的方案
            var existingRecs = await _context.Recommendations
        .Where(r => r.GroupId == groupId)
        .ToListAsync();

            // ★ 開發階段修改：如果有舊資料，先刪除，強制重新生成 ★
            if (existingRecs.Any())
            {
                _context.Recommendations.RemoveRange(existingRecs);
                await _context.SaveChangesAsync();
            }

            // 2. 取得共同時間段
            var timeRanges = await GetCommonTimeRangesAsync(groupId);
            if (!timeRanges.Any()) return new List<Recommendation>();

            // 3. 取得地點偏好 (邏輯不變)
            var rawPlaces = await _context.Preferences
                .Where(p => p.GroupId == groupId && !string.IsNullOrEmpty(p.PlacesToGo))
                .Select(p => p.PlacesToGo)
                .ToListAsync();

            var places = rawPlaces
                .SelectMany(str => str.Split(new[] { ',', '，' }, StringSplitOptions.RemoveEmptyEntries))
                .Select(p => p.Trim())
                .Where(p => !string.IsNullOrEmpty(p))
                .Distinct()
                .ToList();

            if (!places.Any()) places.Add("未定地點");

            var settings = await GetGroupPreferenceSettingsAsync(groupId);

            var group = await _context.TravelGroups.FindAsync(groupId);
            int tripDays = group?.TravelDays ?? 5; // 防呆
            if (tripDays < 1) tripDays = 1;

            // 計算群組人數（若 TargetNumber > 0 優先使用）
            int memberCount = (group?.TargetNumber > 0) ? group!.TargetNumber : await _context.GroupMembers.CountAsync(m => m.GroupId == groupId);

            var newRecommendations = new List<Recommendation>();

            foreach (var range in timeRanges)
            {
                foreach (var place in places)
                {
                    DateOnly priceCheckStart = range.StartDate;
                    DateOnly priceCheckEnd = range.StartDate.AddDays(tripDays - 1);
                    if (priceCheckEnd > range.EndDate) priceCheckEnd = range.EndDate;

                    // 呼叫 TravelInfoService
                    var travelInfo = await _travelInfoService.GetTravelInfoAsync(
                        place,
                        priceCheckStart,
                        priceCheckEnd,
                        settings.AllowTransfer,
                        memberCount, // <--- 補上這個參數！
                        settings.StarRating,
                        settings.MedianBudget
                    );

                    var rec = new Recommendation
                    {
                        GroupId = groupId,
                        StartDate = priceCheckStart.ToDateTime(TimeOnly.MinValue),
                        EndDate = priceCheckEnd.ToDateTime(TimeOnly.MinValue),
                        Location = place,
                        DepartFlight = travelInfo.DepartFlight,
                        ReturnFlight = travelInfo.ReturnFlight,
                        Hotel = travelInfo.HotelName,
                        Price = travelInfo.TotalPrice,
                        Vote = 0,
                        CreatedAt = DateTime.Now,
                        UpdatedAt = DateTime.Now
                    };

                    newRecommendations.Add(rec);
                }
            }

            await _context.Recommendations.AddRangeAsync(newRecommendations);
            await _context.SaveChangesAsync();

            return newRecommendations;
        }
        // 8-2 拿畫面
        public async Task<RecommendationViewModel> GetRecommendationViewModelAsync(int groupId, int currentUserId)
        {
            // 1. 取得群組 (不做多餘假設)
            var group = await _context.TravelGroups.FindAsync(groupId);
            if (group == null) return new RecommendationViewModel();

            // ★★★ 修正：沒有 JoinedCount，我們直接查資料庫算實際人數 ★★★
            // 雖然這個變數在下面計算 AvailableMembersCount 時沒用到(是用 TimeSlots 算)，
            // 但如果您想顯示 "5人中的3人有空"，這個總人數還是需要的。
            var totalMemberCount = await _context.GroupMembers
                .CountAsync(m => m.GroupId == groupId);

            // 2. 取得推薦方案
            var recs = await _context.Recommendations
                .Where(r => r.GroupId == groupId)
                .OrderByDescending(r => r.Vote)
                .ToListAsync();

            // 3. 取得成員的時間表 (用來算人數)
            var memberIds = await _context.GroupMembers
                .Where(gm => gm.GroupId == groupId)
                .Select(gm => gm.UserId)
                .ToListAsync();

            var allMemberSlots = await _context.MemberTimeSlots
                .Where(slot => memberIds.Contains(slot.UserId))
                .ToListAsync();

            var myVotes = new List<int>(); // 暫時給空值

            // 4. 轉換 ViewModel
            var cards = recs.Select(r =>
            {
                // [人數計算] (保持不變)
                int availableCount = allMemberSlots
                    .Where(slot =>
                        DateOnly.FromDateTime(slot.StartAt) <= DateOnly.FromDateTime(r.StartDate) &&
                        DateOnly.FromDateTime(slot.EndAt) >= DateOnly.FromDateTime(r.EndDate)
                    )
                    .Select(s => s.UserId)
                    .Distinct()
                    .Count();

                // [地名解析] 
                // 假設資料庫存的是 "NRT" 或 "NRT|成田"
                // 我們可以用 AirportData 反查城市名，讓顯示更友善
                string code = r.Location.Contains("|") ? r.Location.Split('|')[0].Trim() : r.Location;
                string cityName = AirportData.GetCityName(code);
                // 如果 AirportData.GetCityName 沒找到，會回傳 code，所以這裡很安全

                string displayName = string.IsNullOrEmpty(cityName) ? code : cityName;

                return new RecommendationCard
                {
                    RecommendationId = r.Index,

                    // [修改] 顯示名稱改用城市名 (e.g. "東京")
                    PlaceName = displayName,

                    DateRange = $"{r.StartDate:MM/dd} - {r.EndDate:MM/dd}",
                    TimeSlotId = $"{r.StartDate:MMdd}-{r.EndDate:MMdd}",
                    Price = r.Price,
                    UpdatedAt = r.UpdatedAt,
                    DepartFlight = r.DepartFlight,
                    ReturnFlight = r.ReturnFlight,
                    CurrentVotes = r.Vote,
                    IsVotedByCurrentUser = myVotes.Contains(r.Index),
                    AvailableMembersCount = availableCount,

                    // ★★★ [新增] 填入新欄位 ★★★
                    PlaceCode = code,        // 傳給 API 用的代碼 (e.g. "NRT")
                    StartDate = r.StartDate, // 完整日期物件
                    EndDate = r.EndDate      // 完整日期物件
                };
            }).ToList();

            // 5. 製作時間篩選器
            var timeSlots = recs
         .GroupBy(r => new { r.StartDate, r.EndDate }) // 依照日期區間分組
         .OrderBy(g => g.Key.StartDate)                // 依照開始時間排序
         .Select((g, index) =>
         {
             var start = g.Key.StartDate;
             var end = g.Key.EndDate;
             var timeSlotId = $"{start:MMdd}-{end:MMdd}";

             // 技巧：直接從已經算好人數的 cards 裡面抓一個代表出來取值
             // 因為同一個時間區間，有空的人數一定是一樣的，不用重算
             var representativeCard = cards.FirstOrDefault(c => c.TimeSlotId == timeSlotId);
             int count = representativeCard?.AvailableMembersCount ?? 0;

             return new TimeSlotFilter
             {
                 Id = timeSlotId,
                 Label = $"區間 {index + 1}",
                 DateRange = $"{start:MM/dd} - {end:MM/dd}",

                 // ★ 關鍵修正：計算實際天數 (結束減開始 + 1)
                 Duration = (end - start).Days + 1,

                 AvailableCount = count
             };
         })
         .ToList();

            // 偏好統計結果
            var allPreferences = await _context.Preferences
                    .Where(p => p.GroupId == groupId)
                    .ToListAsync();

            var summary = new GroupPreferenceSummary
            {
                MemberCount = allPreferences.Count,
                TransferAcceptCount = 0,
                TransferRejectCount = 0,
                MedianHotelBudget = 0,
                AvgHotelRating = 0
            };

            if (allPreferences.Any())
            {
                // 1. 計算轉機票數
                summary.TransferAcceptCount = allPreferences.Count(p => p.Tranfer);
                summary.TransferRejectCount = allPreferences.Count(p => !p.Tranfer);

                // 2. 計算預算中位數 (先濾掉 null，排序，然後取中間)
                var budgets = allPreferences
                    .Where(p => p.HotelBudget.HasValue)
                    .Select(p => p.HotelBudget.Value)
                    .OrderBy(b => b)
                    .ToList();

                if (budgets.Any())
                {
                    int midIndex = budgets.Count / 2;
                    // 如果是偶數個，通常取中間兩個平均，這裡為了簡單直接取中間偏後那一個，或直接取中位數邏輯
                    summary.MedianHotelBudget = (budgets.Count % 2 != 0)
                        ? budgets[midIndex]
                        : (budgets[midIndex - 1] + budgets[midIndex]) / 2;
                }

                // 3. 計算星級平均 (取到小數點第一位)
                var ratings = allPreferences
                    .Where(p => p.HotelRating.HasValue)
                    .Select(p => p.HotelRating.Value)
                    .ToList();

                if (ratings.Any())
                {
                    summary.AvgHotelRating = Math.Round(ratings.Average(), 1);
                }

                // ★ 1. 判斷是否全員投票完成
                bool isVoteCompleted = await CheckIfAllVotedAsync(groupId);

                // ★ 2. 如果完成，找出最高票 (贏家)
                RecommendationCard winningCard = null;
                if (isVoteCompleted && cards.Any())
                {
                    // 簡單邏輯：票數最高者贏，同票則取第一個 (或依價格/創建時間排序)
                    var winner = cards.OrderByDescending(c => c.CurrentVotes).First();
                    winningCard = winner;
                }

                // 3. 回傳 ViewModel
                return new RecommendationViewModel
                {
                    GroupId = groupId,
                    TotalOptionsCount = cards.Count,
                    TimeSlots = timeSlots,
                    OptionCards = cards,
                    Summary = summary,

                    // ★ 填入新屬性
                    IsVoteCompleted = isVoteCompleted,
                    WinningCard = winningCard
                };
            }

            // 4. 回傳 ViewModel
            return new RecommendationViewModel
            {
                GroupId = groupId,
                TotalOptionsCount = cards.Count,
                TimeSlots = timeSlots,
                OptionCards = cards,
                Summary = summary // ★ 記得把算好的塞進去
            };
        }
        // 9. 讀取個人請假/可用日 (LeaveDates)
        public async Task<List<AvailableSlotInput>> GetSuggestedPersonalScheduleAsync(int groupId, int userId)
        {
            var group = await _context.TravelGroups.FindAsync(groupId);
            if (group == null) return new List<AvailableSlotInput>();

            var tripStartDate = DateOnly.FromDateTime(group.DateStart);
            var tripEndDate = DateOnly.FromDateTime(group.DateEnd);

            var availableDates = await _context.LeaveDates
                .Where(l => l.UserId == userId && l.LeaveDate1.HasValue) // 過濾掉日期是空的
                .Where(l => l.LeaveDate1 >= tripStartDate && l.LeaveDate1 <= tripEndDate)
                .Select(l => l.LeaveDate1.Value) // 只把 DateOnly 取出來
                .ToListAsync();

            var suggestions = availableDates.Select(date => new AvailableSlotInput
            {
                StartAt = date.ToDateTime(TimeOnly.MinValue), // 00:00:00
                EndAt = date.ToDateTime(new TimeOnly(23, 59, 59)) // 23:59:59
            }).ToList();

            return suggestions;
        }

        // 10. 取得偏好設定
        public async Task<Preference?> GetMyPreferenceAsync(int groupId, int userId)
        {
            return await _context.Preferences
                .FirstOrDefaultAsync(p => p.GroupId == groupId && p.UserId == userId);
        }

        // 11. 取得已提交的時間
        public async Task<List<AvailableSlotInput>> GetMyTimeSlotsAsync(int groupId, int userId)
        {
            return await _context.MemberTimeSlots
                .Where(t => t.GroupId == groupId && t.UserId == userId)
                .Select(t => new AvailableSlotInput
                {
                    StartAt = t.StartAt,
                    EndAt = t.EndAt
                })
                .ToListAsync();
        }

        // 12. 提交投票
        // 回傳：這些方案投票後的最新票數 (Dictionary<RecommendationId, VoteCount>)
        // 修改 SubmitBatchVotesAsync 方法
        public async Task<Dictionary<int, int>> SubmitBatchVotesAsync(int groupId, int userId, List<int> recommendationIds)
        {
            // 1. 驗證成員資格與鎖定狀態
            var member = await _context.GroupMembers
                .FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == userId);

            if (member == null) throw new Exception("非成員");

            // 2.【關鍵修正】先清除該使用者在這個群組的所有舊投票 (Reset)
            // 這樣可以確保使用者的選擇跟資料庫完全同步
            var oldVotes = await _context.RecommendationVotes
                .Where(v => v.GroupId == groupId && v.UserId == userId)
                .ToListAsync();

            if (oldVotes.Any())
            {
                _context.RecommendationVotes.RemoveRange(oldVotes);
            }

            // 3. 寫入新的投票紀錄
            // 過濾掉無效的 ID (防呆)，並建立實體
            var validRecIds = await _context.Recommendations
                .Where(r => r.GroupId == groupId && recommendationIds.Contains(r.Index)) // 注意：你的 PK 是 Index
                .Select(r => r.Index)
                .ToListAsync();

            var newVoteEntities = validRecIds.Select(recId => new RecommendationVote
            {
                GroupId = groupId,
                UserId = userId,
                RecommendationId = recId,
                CreatedAt = DateTime.Now
            }).ToList();

            await _context.RecommendationVotes.AddRangeAsync(newVoteEntities);

            // 先儲存投票紀錄，確保關聯表正確
            await _context.SaveChangesAsync();
            // 嘗試推進Status
            await TryAdvanceStatusAsync(groupId);

            // 4. 更新 Recommendation 表上的 Vote 計數 (Denormalization)
            // 雖然可以即時 Count，但為了列表效能，通常還是會維護一個數字欄位
            var allGroupRecs = await _context.Recommendations
                .Where(r => r.GroupId == groupId)
                .ToListAsync();

            foreach (var rec in allGroupRecs)
            {
                // 從 Vote 表重新計算真實票數，確保數據一致
                rec.Vote = await _context.RecommendationVotes
                    .CountAsync(v => v.RecommendationId == rec.Index);
            }

            // 5. 標記使用者已完成投票 (Lock)

            await _context.SaveChangesAsync();

            // 6. 回傳最新票數給前端更新
            return allGroupRecs.ToDictionary(k => k.Index, v => v.Vote);
        }

        public async Task<bool> CheckIfAllVotedAsync(int groupId)
        {
            var totalMembers = await _context.GroupMembers.CountAsync(m => m.GroupId == groupId);

            // ★ 修改判定邏輯：去查 RecommendationVote 表，看有幾個人投過票 (Distinct User)
            var votedMembersCount = await _context.RecommendationVotes
                .Where(v => v.GroupId == groupId)
                .Select(v => v.UserId)
                .Distinct()
                .CountAsync();

            return votedMembersCount >= totalMembers;
        }

        // 新增：將媒合結果轉為正式行程 (Finalize Trip)
        public async Task<int> CreateTripFromRecommendationAsync(int groupId, int recommendationId)
        {
            // 1. 取得來源資料
            var group = await _context.TravelGroups.FindAsync(groupId);
            var rec = await _context.Recommendations.FindAsync(recommendationId);

            if (group == null || rec == null) throw new Exception("資料遺失");

            // 2. 準備 Trip 物件 (利用 Navigation Property 處理關聯)
            var newTrip = new Trip
            {
                Title = group.Title + " (媒合成功)",
                StartDate = DateOnly.FromDateTime(rec.StartDate),
                EndDate = DateOnly.FromDateTime(rec.EndDate),
                InviteCode = Guid.NewGuid(),
                CreatedAt = DateTimeOffset.Now,
                UpdatedAt = DateTimeOffset.Now
            };

            _context.Trips.Add(newTrip); // 加入追蹤

            // 3. 建立航班 (Flights)
            var flights = new List<Flight>();

            // 去程
            if (!string.IsNullOrEmpty(rec.DepartFlight))
            {
                var flightData = ParseFlightString(rec.DepartFlight, rec.StartDate);
                if (flightData != null)
                {
                    flights.Add(new Flight
                    {
                        Trip = newTrip,    // 透過物件關聯
                        FlightNumber = flightData.Value.FlightNo,
                        Carrier = flightData.Value.Carrier,
                        DepartUtc = flightData.Value.Depart,
                        ArriveUtc = flightData.Value.Arrive,
                        Price = 0,
                        CreatedAt = DateTimeOffset.Now
                    });
                }
            }

            // 回程
            if (!string.IsNullOrEmpty(rec.ReturnFlight))
            {
                var flightData = ParseFlightString(rec.ReturnFlight, rec.EndDate);
                if (flightData != null)
                {
                    flights.Add(new Flight
                    {
                        Trip = newTrip,
                        FlightNumber = flightData.Value.FlightNo,
                        Carrier = flightData.Value.Carrier,
                        DepartUtc = flightData.Value.Depart,
                        ArriveUtc = flightData.Value.Arrive,
                        Price = 0,
                        CreatedAt = DateTimeOffset.Now
                    });
                }
            }
            if (flights.Any()) _context.Flights.AddRange(flights);

            // 4. 建立住宿 (Accommodation) 與 景點快照 (PlacesSnapshot)
            if (!string.IsNullOrEmpty(rec.Hotel))
            {
                var hotelSpot = new PlacesSnapshot
                {
                    NameZh = rec.Hotel,
                    NameEn = rec.Hotel,
                    ExternalPlaceId = $"REC-TEMP-{Guid.NewGuid()}",
                    AddressSnapshot = rec.Location,
                    Lat = 0,
                    Lng = 0,
                    CreatedAt = DateTimeOffset.Now,
                    UpdatedAt = DateTimeOffset.Now
                };

                var accommodation = new Accommodation
                {
                    Trip = newTrip,
                    Spot = hotelSpot,

                    HotelName = rec.Hotel,
                    Address = rec.Location,

                    CheckInDate = rec.StartDate,
                    CheckOutDate = rec.EndDate,

                    Price = rec.Price,
                    CreatedAt = DateTimeOffset.Now
                };

                _context.Accommodations.Add(accommodation);
            }

            // 5. 轉移成員 (GroupMember -> TripMember)
            var membersData = await _context.GroupMembers
                .Where(gm => gm.GroupId == groupId)
                .Join(_context.Preferences,
                    gm => new { gm.GroupId, gm.UserId },
                    p => new { p.GroupId, p.UserId },
                    (gm, p) => new { gm, p })
                .ToListAsync();

            var tripMembers = membersData.Select(item => new TripMember
            {
                Trip = newTrip,
                UserId = item.gm.UserId,

                RoleType = (byte)(item.gm.Role == "Owner" ? 1 : 2),
                Budget = item.p.TotalBudget,

                JoinedAt = DateTimeOffset.Now
            }).ToList();

            _context.TripMembers.AddRange(tripMembers);

            // 6. 建立地區關聯 (TripRegions)
            string iataCode = rec.Location.Trim(); // 例如 "NRT"

            // 1. 利用既有的工具反查城市名稱 (例如取得 "東京" 或 "Tokyo")
            // 假設 AirportData.GetCityName 是您現有的靜態輔助方法
            string cityName = AirportData.GetCityName(iataCode);

            // 2. 如果反查回來還是 IATA (代表查不到)，就用原本的；如果有查到，就用城市名搜尋
            string searchKey = string.IsNullOrEmpty(cityName) ? iataCode : cityName;

            // 3. 去 GlobalRegions 找對應的地區
            var region = await _context.GlobalRegions
                .FirstOrDefaultAsync(r => r.Name == searchKey || r.NameEn == searchKey);

            // 4. 建立關聯
            if (region != null)
            {
                _context.TripRegions.Add(new TripRegion
                {
                    Trip = newTrip,
                    RegionId = region.Id
                });
            }
            else
            {
                // (選用) 如果完全找不到對應的 Region，這裡可以寫 Log 或是建立一個 "未分類" 的關聯
                // Console.WriteLine($"找不到對應的地區: {searchKey} (Code: {iataCode})");
            }

            // 7. 更新群組狀態並存檔
            group.Status = GroupStatus.JOINING;
            group.UpdateAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            return newTrip.Id;
        }
        // 輔助：解析航班字串 (依照你實際存入的格式實作)
        private (string FlightNo, string Carrier, DateTimeOffset Depart, DateTimeOffset Arrive)? ParseFlightString(string flightStr, DateTime baseDate)
        {
            // Regex: 抓取 "JX800", "08:00", "12:00"
            var regex = new Regex(@"^(?<no>[\w\d]+)\s*\((?<dep>\d{2}:\d{2})\s*-\s*(?<arr>\d{2}:\d{2})\)");
            var match = regex.Match(flightStr.Trim());

            if (!match.Success) return null;

            string flightNo = match.Groups["no"].Value; // JX800
            string depTime = match.Groups["dep"].Value; // 08:00
            string arrTime = match.Groups["arr"].Value; // 12:00

            // 1. 取得航空公司代號 (前兩碼)
            // 簡單判斷：通常是前兩個字元，如 BR, CI, JX
            string carrier = flightNo.Length >= 2 ? flightNo.Substring(0, 2) : "Unknown";

            // 2. 組合 DateTimeOffset
            // 注意：Flight 資料表用的是 DateTimeOffset
            if (TimeSpan.TryParse(depTime, out TimeSpan tsDep) && TimeSpan.TryParse(arrTime, out TimeSpan tsArr))
            {
                // 組合日期與時間 (使用 baseDate)
                DateTime dtDep = baseDate.Date + tsDep;
                DateTime dtArr = baseDate.Date + tsArr;

                // 跨日處理：如果抵達時間比出發時間早，代表是隔天
                if (dtArr < dtDep)
                {
                    dtArr = dtArr.AddDays(1);
                }

                return (flightNo, carrier, new DateTimeOffset(dtDep), new DateTimeOffset(dtArr));
            }

            return null;
        }


        // --- 私有保護機制 (Guards) ---

        // 驗證群組存在、使用者是成員、以及是否已鎖定
        // 回傳: (GroupMember, IsLocked)
        private async Task<GroupMember> ValidateMemberAccessAsync(int groupId, int userId, bool requireNotSubmitted = false)
        {
            var member = await _context.GroupMembers
                .Include(m => m.Group)
                .FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == userId);

            if (member == null)
            {
                throw new KeyNotFoundException($"找不到群組 (ID: {groupId}) 或您不是該群組成員。");
            }

            if (member.Group.Status == GroupStatus.CANCELLED)
            {
                throw new InvalidOperationException("此媒合群組已取消，無法再進行任何操作。");
            }

            if (requireNotSubmitted && member.SubmittedAt != null)
            {
                throw new InvalidOperationException("您已經提交過時間，無法再修改資料 (Submissions are locked)。");
            }

            return member;
        }

        // 改狀態
        public async Task<string> TryAdvanceStatusAsync(int groupId)
        {
            var group = await _context.TravelGroups
                .AsTracking()
                .FirstOrDefaultAsync(g => g.GroupId == groupId);

            if (group == null) throw new Exception("Group not found.");

            if (group.Status == GroupStatus.JOINING) return group.Status;

            // 1. 偏好完成: PREF -> VOTING
            if(group.Status == GroupStatus.PREF)
            {
                var totalTarget = group.TargetNumber > 0
                    ? group.TargetNumber
                    : await _context.GroupMembers.CountAsync(m => m.GroupId == groupId);

                var completedPrefUsers = await _context.Preferences
                    .Where(p => p.GroupId == groupId && !string.IsNullOrWhiteSpace(p.PlacesToGo))
                    .Select(p => p.UserId)
                    .Distinct()
                    .CountAsync();

                var submittedCount = await _context.GroupMembers
                    .CountAsync(m => m.GroupId == groupId && m.SubmittedAt != null);

                if (completedPrefUsers >= totalTarget && submittedCount >= totalTarget)
                {
                    group.Status = GroupStatus.VOTING;
                    group.UpdateAt = DateTime.UtcNow;
                    await _context.SaveChangesAsync();
                    return group.Status;
                }
            }

            return group.Status;
        }
        // 取得偏好參數
        private async Task<(bool AllowTransfer, int? StarRating, decimal? MedianBudget)> GetGroupPreferenceSettingsAsync(int groupId)
        {
            var allPreferences = await _context.Preferences
                .Where(p => p.GroupId == groupId)
                .ToListAsync();

            // 1. 統計轉機 (Transfer)
            bool allowTransfer = true;
            if (allPreferences.Any())
            {
                int accept = allPreferences.Count(p => p.Tranfer);
                int reject = allPreferences.Count(p => !p.Tranfer);
                // 規則：接受 >= 不接受，就開啟轉機
                allowTransfer = accept >= reject;
            }

            // 2. 統計星級 (Rating)
            int? starRating = null;
            var validRatings = allPreferences
                .Where(p => p.HotelRating.HasValue)
                .Select(p => p.HotelRating.Value)
                .ToList();

            if (validRatings.Any())
            {
                starRating = (int)Math.Round(validRatings.Average());
                if (starRating < 3) starRating = 3;
                if (starRating > 5) starRating = 5;
            }

            // 3. 統計預算 (Budget)
            decimal? medianBudget = null;
            var validBudgets = allPreferences
                .Where(p => p.HotelBudget.HasValue)
                .Select(p => p.HotelBudget.Value)
                .OrderBy(x => x)
                .ToList();

            if (validBudgets.Any())
            {
                int count = validBudgets.Count;
                if (count % 2 == 0)
                    medianBudget = (validBudgets[count / 2 - 1] + validBudgets[count / 2]) / 2.0m;
                else
                    medianBudget = validBudgets[count / 2];
            }

            return (allowTransfer, starRating, medianBudget);
        }
        // 查即時價格
        // 查即時價格 (修正版：查完順便更新資料庫)
        public async Task<object> GetLiveTravelPriceAsync(int groupId, string location, DateOnly start, DateOnly end)
        {
            // 1. 取得一致的偏好設定
            var settings = await GetGroupPreferenceSettingsAsync(groupId);

            // 計算 memberCount
            var group = await _context.TravelGroups.FindAsync(groupId);
            int memberCount = (group != null && group.TargetNumber > 0)
                ? group.TargetNumber
                : await _context.GroupMembers.CountAsync(m => m.GroupId == groupId);

            // 2. 呼叫外部 API 查價
            var result = await _travelInfoService.GetTravelInfoAsync(
                location,
                start,
                end,
                settings.AllowTransfer,
                memberCount,            // 傳入人數
                settings.StarRating,
                settings.MedianBudget
            );

            // 3. ★★★ 關鍵補強：既然查到了最新價格，順便更新資料庫，讓列表也變準確 ★★★
            // 找出對應的那筆 Recommendation (如果有的話)
            var dateTimeStart = start.ToDateTime(TimeOnly.MinValue);
            var dateTimeEnd = end.ToDateTime(TimeOnly.MinValue);

            // 注意：這裡的比對條件要看你的邏輯，假設地點和日期完全吻合才更新
            // 有時候 Location 可能是 "TPE|台北"，所以用 Contains 或 Split 比較保險
            // 但最準確的是直接用 RecommendationId (如果您前端有傳的話)
            // 這裡先用日期 + 地點模糊比對
            var existingRec = await _context.Recommendations
                .FirstOrDefaultAsync(r =>
                    r.GroupId == groupId &&
                    (r.Location == location || r.Location.StartsWith(location)) &&
                    r.StartDate == dateTimeStart); // 這裡只比對開始日期，因為通常同一天開始的方案只有一個

            if (existingRec != null)
            {
                // 如果價格差異很大，或者有新資訊，就更新
                existingRec.Price = result.TotalPrice;
                existingRec.DepartFlight = result.DepartFlight;
                existingRec.ReturnFlight = result.ReturnFlight;
                existingRec.Hotel = result.HotelName;
                existingRec.UpdatedAt = DateTime.Now;

                await _context.SaveChangesAsync();
            }

            return result;
        }
    }
}
