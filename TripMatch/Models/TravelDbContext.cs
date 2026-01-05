using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace TripMatch.Models;

public partial class TravelDbContext : DbContext
{
    public TravelDbContext()
    {
    }

    public TravelDbContext(DbContextOptions<TravelDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Accommodation> Accommodations { get; set; }

    public virtual DbSet<AspNetRole> AspNetRoles { get; set; }

    public virtual DbSet<AspNetRoleClaim> AspNetRoleClaims { get; set; }

    public virtual DbSet<AspNetUser> AspNetUsers { get; set; }

    public virtual DbSet<AspNetUserClaim> AspNetUserClaims { get; set; }

    public virtual DbSet<AspNetUserLogin> AspNetUserLogins { get; set; }

    public virtual DbSet<AspNetUserToken> AspNetUserTokens { get; set; }

    public virtual DbSet<BlindBoxSubmission> BlindBoxSubmissions { get; set; }

    public virtual DbSet<Category> Categories { get; set; }

    public virtual DbSet<Expense> Expenses { get; set; }

    public virtual DbSet<ExpenseParticipant> ExpenseParticipants { get; set; }

    public virtual DbSet<Flight> Flights { get; set; }

    public virtual DbSet<GlobalRegion> GlobalRegions { get; set; }

    public virtual DbSet<GroupMember> GroupMembers { get; set; }

    public virtual DbSet<ItineraryItem> ItineraryItems { get; set; }

    public virtual DbSet<LeaveDate> LeaveDates { get; set; }

    public virtual DbSet<LocationCategory> LocationCategories { get; set; }

    public virtual DbSet<MemberTimeSlot> MemberTimeSlots { get; set; }

    public virtual DbSet<PlacesSnapshot> PlacesSnapshots { get; set; }

    public virtual DbSet<Preference> Preferences { get; set; }

    public virtual DbSet<Recommandation> Recommandations { get; set; }

    public virtual DbSet<Settlement> Settlements { get; set; }

    public virtual DbSet<TravelGroup> TravelGroups { get; set; }

    public virtual DbSet<Trip> Trips { get; set; }

    public virtual DbSet<TripMember> TripMembers { get; set; }

    public virtual DbSet<TripRegion> TripRegions { get; set; }

    public virtual DbSet<Wishlist> Wishlists { get; set; }

//    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
//#warning To protect potentially sensitive information in your connection string, you should move it out of source code. You can avoid scaffolding the connection string by using the Name= syntax to read it from configuration - see https://go.microsoft.com/fwlink/?linkid=2131148. For more guidance on storing connection strings, see https://go.microsoft.com/fwlink/?LinkId=723263.
//        => optionsBuilder.UseSqlServer("Server=.;Database=travelDb;Trusted_Connection=True;TrustServerCertificate=True");

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Accommodation>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__Accommod__3214EC079DED41CB");

            entity.ToTable(tb => tb.HasComment("住宿資訊表：記錄行程中的飯店安排"));

            entity.HasIndex(e => e.SpotId, "IX_Accommodations_Spot");

            entity.HasIndex(e => new { e.TripId, e.CheckInDate }, "IX_Accommodations_Trip_CheckIn");

            entity.Property(e => e.Id).HasComment("流水號主鍵");
            entity.Property(e => e.Address)
                .HasMaxLength(500)
                .HasComment("飯店地址快照");
            entity.Property(e => e.CheckInDate).HasComment("入住日期時間");
            entity.Property(e => e.CheckOutDate).HasComment("退房日期時間");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("(sysdatetimeoffset())")
                .HasComment("資料建立時間");
            entity.Property(e => e.HotelName)
                .HasMaxLength(255)
                .HasComment("飯店名稱 (冗餘存放，避免 Join 並作為快照備份)");
            entity.Property(e => e.Price)
                .HasComment("住宿總費用")
                .HasColumnType("decimal(18, 2)");
            entity.Property(e => e.RowVersion)
                .IsRowVersion()
                .IsConcurrencyToken()
                .HasComment("樂觀並行控制欄位 (RowVersion)：確保多人同時編輯住宿資訊時不產生數據覆蓋");
            entity.Property(e => e.SpotId).HasComment("飯店景點快照編號 (Places_Snapshot.SpotId)");
            entity.Property(e => e.TripId).HasComment("隸屬行程 ID (Trips.Id)");

            entity.HasOne(d => d.Spot).WithMany(p => p.Accommodations)
                .HasForeignKey(d => d.SpotId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Accommodations_Places");

            entity.HasOne(d => d.Trip).WithMany(p => p.Accommodations)
                .HasForeignKey(d => d.TripId)
                .HasConstraintName("FK_Accommodations_Trips");
        });

        modelBuilder.Entity<AspNetRole>(entity =>
        {
            entity.HasIndex(e => e.NormalizedName, "RoleNameIndex")
                .IsUnique()
                .HasFilter("([NormalizedName] IS NOT NULL)");

            entity.Property(e => e.Name).HasMaxLength(256);
            entity.Property(e => e.NormalizedName).HasMaxLength(256);
        });

        modelBuilder.Entity<AspNetRoleClaim>(entity =>
        {
            entity.HasIndex(e => e.RoleId, "IX_AspNetRoleClaims_RoleId");

            entity.HasOne(d => d.Role).WithMany(p => p.AspNetRoleClaims).HasForeignKey(d => d.RoleId);
        });

        modelBuilder.Entity<AspNetUser>(entity =>
        {
            entity.HasKey(e => e.UserId);

            entity.HasIndex(e => e.NormalizedEmail, "EmailIndex");

            entity.HasIndex(e => e.NormalizedUserName, "UserNameIndex")
                .IsUnique()
                .HasFilter("([NormalizedUserName] IS NOT NULL)");

            entity.Property(e => e.Email).HasMaxLength(256);
            entity.Property(e => e.NormalizedEmail).HasMaxLength(256);
            entity.Property(e => e.NormalizedUserName).HasMaxLength(256);
            entity.Property(e => e.UserName).HasMaxLength(256);

            entity.HasMany(d => d.Roles).WithMany(p => p.Users)
                .UsingEntity<Dictionary<string, object>>(
                    "AspNetUserRole",
                    r => r.HasOne<AspNetRole>().WithMany().HasForeignKey("RoleId"),
                    l => l.HasOne<AspNetUser>().WithMany().HasForeignKey("UserId"),
                    j =>
                    {
                        j.HasKey("UserId", "RoleId");
                        j.ToTable("AspNetUserRoles");
                        j.HasIndex(new[] { "RoleId" }, "IX_AspNetUserRoles_RoleId");
                    });
        });

        modelBuilder.Entity<AspNetUserClaim>(entity =>
        {
            entity.HasIndex(e => e.UserId, "IX_AspNetUserClaims_UserId");

            entity.HasOne(d => d.User).WithMany(p => p.AspNetUserClaims).HasForeignKey(d => d.UserId);
        });

        modelBuilder.Entity<AspNetUserLogin>(entity =>
        {
            entity.HasKey(e => new { e.LoginProvider, e.ProviderKey });

            entity.HasIndex(e => e.UserId, "IX_AspNetUserLogins_UserId");

            entity.HasOne(d => d.User).WithMany(p => p.AspNetUserLogins).HasForeignKey(d => d.UserId);
        });

        modelBuilder.Entity<AspNetUserToken>(entity =>
        {
            entity.HasKey(e => new { e.UserId, e.LoginProvider, e.Name });

            entity.HasOne(d => d.User).WithMany(p => p.AspNetUserTokens).HasForeignKey(d => d.UserId);
        });

        modelBuilder.Entity<BlindBoxSubmission>(entity =>
        {
            entity.HasKey(e => new { e.ItineraryItemId, e.UserId }).HasName("PK__BlindBox__CA80D4BA74050DFA");

            entity.ToTable(tb => tb.HasComment("盲盒候選清單：儲存參與者投遞的景點方案"));

            entity.HasIndex(e => e.ItineraryItemId, "IX_Submissions_Item");

            entity.Property(e => e.ItineraryItemId).HasComment("關聯的行程細項編號 (ItineraryItems.Id，且 Type 須為 2)");
            entity.Property(e => e.UserId).HasComment("提議者的使用者 ID");
            entity.Property(e => e.IsWinner).HasComment("中獎標籤：1=此提議被系統選中為最終景點");
            entity.Property(e => e.SpotId).HasComment("提議的景點快照編號 (Places_Snapshot.SpotId)");
            entity.Property(e => e.SubmittedAt)
                .HasDefaultValueSql("(sysdatetimeoffset())")
                .HasComment("投遞時間 (可用於決定平手時的順序或種子值)");
            entity.Property(e => e.SuggestionNote)
                .HasMaxLength(200)
                .HasComment("提議者的推薦理由或備註");

            entity.HasOne(d => d.ItineraryItem).WithMany(p => p.BlindBoxSubmissions)
                .HasForeignKey(d => d.ItineraryItemId)
                .HasConstraintName("FK_Submissions_Itinerary");

            entity.HasOne(d => d.Spot).WithMany(p => p.BlindBoxSubmissions)
                .HasForeignKey(d => d.SpotId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Submissions_Spots");
        });

        modelBuilder.Entity<Category>(entity =>
        {
            entity.HasKey(e => e.CategoryId).HasName("PK__Categori__19093A0BCFAE8C84");

            entity.Property(e => e.Name).HasMaxLength(50);
        });

        modelBuilder.Entity<Expense>(entity =>
        {
            entity.HasKey(e => e.ExpenseId).HasName("PK__Expenses__1445CFD396B7C778");

            entity.HasIndex(e => e.TripId, "IX_Expenses_TripId");

            entity.Property(e => e.Amount).HasColumnType("decimal(18, 2)");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysdatetimeoffset())");
            entity.Property(e => e.Title).HasMaxLength(200);

            entity.HasOne(d => d.Category).WithMany(p => p.Expenses)
                .HasForeignKey(d => d.CategoryId)
                .HasConstraintName("Expenses_Categories_FK");

            entity.HasOne(d => d.PaidByNavigation).WithMany(p => p.Expenses)
                .HasForeignKey(d => d.PaidBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("Expenses_TripMembers_FK");

            entity.HasOne(d => d.Trip).WithMany(p => p.Expenses)
                .HasForeignKey(d => d.TripId)
                .HasConstraintName("FK_Expenses_Trips");
        });

        modelBuilder.Entity<ExpenseParticipant>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__ExpenseP__3214EC070D49BE6D");

            entity.Property(e => e.ShareAmount).HasColumnType("decimal(18, 2)");

            entity.HasOne(d => d.Expense).WithMany(p => p.ExpenseParticipants)
                .HasForeignKey(d => d.ExpenseId)
                .HasConstraintName("FK_Participants_Expenses");

            entity.HasOne(d => d.User).WithMany(p => p.ExpenseParticipants)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("ExpenseParticipants_TripMembers_FK");
        });

        modelBuilder.Entity<Flight>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__Flights__3214EC07D8017DF3");

            entity.ToTable(tb => tb.HasComment("航班資訊表：儲存行程交通中的飛行排程與費用紀錄"));

            entity.HasIndex(e => new { e.TripId, e.DepartUtc }, "IX_Flights_Trip_Time");

            entity.Property(e => e.Id).HasComment("航班流水號主鍵");
            entity.Property(e => e.ArriveUtc).HasComment("預計抵達時間 (包含當地時區位移偏移量)");
            entity.Property(e => e.Carrier)
                .HasMaxLength(100)
                .HasComment("航空公司名稱 (例如：長榮航空、JAL)");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("(sysdatetimeoffset())")
                .HasComment("系統紀錄建立時間");
            entity.Property(e => e.DepartUtc).HasComment("預計起飛時間 (包含當地時區位移偏移量)");
            entity.Property(e => e.FlightNumber)
                .HasMaxLength(20)
                .HasComment("航班號碼 (例如：BR225、CI100)");
            entity.Property(e => e.FromAirport)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength()
                .HasComment("出發機場 IATA 3碼 (例如：TPE)");
            entity.Property(e => e.Price)
                .HasComment("機票費用 (建議以本位幣記錄，支援匯率轉換後的小數點)")
                .HasColumnType("decimal(18, 2)");
            entity.Property(e => e.RowVersion)
                .IsRowVersion()
                .IsConcurrencyToken()
                .HasComment("樂觀並行控制欄位 (RowVersion)：處理多人編輯衝突的核心機制");
            entity.Property(e => e.ToAirport)
                .HasMaxLength(3)
                .IsUnicode(false)
                .IsFixedLength()
                .HasComment("抵達機場 IATA 3碼 (例如：NRT)");
            entity.Property(e => e.TripId).HasComment("隸屬行程 ID (Trips.Id)");

            entity.HasOne(d => d.Trip).WithMany(p => p.Flights)
                .HasForeignKey(d => d.TripId)
                .HasConstraintName("FK_Flights_Trips");
        });

        modelBuilder.Entity<GlobalRegion>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__GlobalRe__3214EC07B6F1B7CC");

            entity.ToTable(tb => tb.HasComment("全球區域主檔：存放國家與城市的層級資料，支援中英文雙語"));

            entity.HasIndex(e => e.ParentId, "IX_GlobalRegions_ParentId");

            entity.HasIndex(e => e.PlaceId, "IX_GlobalRegions_PlaceId");

            entity.HasIndex(e => e.PlaceId, "UQ__GlobalRe__D5222B6F016C25D3").IsUnique();

            entity.Property(e => e.Id).HasComment("區域自動編號主鍵");
            entity.Property(e => e.CountryCode)
                .HasMaxLength(2)
                .IsUnicode(false)
                .IsFixedLength()
                .HasComment("ISO 3166-1 alpha-2 國家代碼 (如 JP, TW)");
            entity.Property(e => e.IsHot).HasComment("熱門推薦標記：1為熱門地點");
            entity.Property(e => e.Level).HasComment("層級：1國家, 2城市");
            entity.Property(e => e.Name)
                .HasMaxLength(100)
                .HasComment("中文地名顯示名稱");
            entity.Property(e => e.NameEn)
                .HasMaxLength(150)
                .IsUnicode(false)
                .HasComment("英文地名顯示名稱 (對接 Google API 使用)");
            entity.Property(e => e.ParentId).HasComment("父層 ID (城市的 ParentId 會指向國家)");
            entity.Property(e => e.PlaceId)
                .HasMaxLength(255)
                .IsUnicode(false)
                .HasComment("Google Place API 的唯一識別碼");

            entity.HasOne(d => d.Parent).WithMany(p => p.InverseParent)
                .HasForeignKey(d => d.ParentId)
                .HasConstraintName("FK_GlobalRegions_Parent");
        });

        modelBuilder.Entity<GroupMember>(entity =>
        {
            entity.HasKey(e => new { e.GroupId, e.UserId });

            entity.HasIndex(e => new { e.GroupId, e.JoinedAt }, "IX_GroupMembers_GroupId_JoinedAt");

            entity.HasIndex(e => new { e.GroupId, e.SubmittedAt }, "IX_GroupMembers_GroupId_SubmittedAt");

            entity.HasIndex(e => new { e.UserId, e.JoinedAt }, "IX_GroupMembers_UserId_JoinedAt").IsDescending(false, true);

            entity.Property(e => e.InviteCode)
                .HasMaxLength(12)
                .IsUnicode(false);
            entity.Property(e => e.JoinedAt).HasPrecision(0);
            entity.Property(e => e.Role).HasMaxLength(10);
            entity.Property(e => e.SubmittedAt).HasPrecision(0);

            entity.HasOne(d => d.Group).WithMany(p => p.GroupMemberGroups)
                .HasForeignKey(d => d.GroupId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GroupMembers_GroupId_TravelGroups");

            entity.HasOne(d => d.InviteCodeNavigation).WithMany(p => p.GroupMemberInviteCodeNavigations)
                .HasPrincipalKey(p => p.InviteCode)
                .HasForeignKey(d => d.InviteCode)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GroupMembers_InviteCode_TravelGroups");

            entity.HasOne(d => d.User).WithMany(p => p.GroupMembers)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_GroupMembers_AspNetUsers");
        });

        modelBuilder.Entity<ItineraryItem>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__Itinerar__3214EC07A660425F");

            entity.ToTable(tb => tb.HasComment("行程細項排程表：儲存每日具體的景點或活動排程"));

            entity.Property(e => e.Id).HasComment("流水號主鍵");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("(sysdatetimeoffset())")
                .HasComment("資料建立時間");
            entity.Property(e => e.DayNumber)
                .HasDefaultValue(1)
                .HasComment("行程天數順序 (例如 Day 1 填 1)");
            entity.Property(e => e.EndTime)
                .HasPrecision(0)
                .HasComment("預計結束時間 (HH:mm)");
            entity.Property(e => e.IsOpened).HasComment("盲盒開啟狀態：0=未開, 1=已開 (僅用於 ItemType=2)");
            entity.Property(e => e.ItemType)
                .HasDefaultValue(1)
                .HasComment("項目類型：1=一般景點 (Normal), 2=隨機盲盒 (BlindBox)");
            entity.Property(e => e.RowVersion)
                .IsRowVersion()
                .IsConcurrencyToken()
                .HasComment("樂觀並行控制欄位 (Rowversion)，防止多人編輯衝突覆蓋");
            entity.Property(e => e.SortOrder).HasComment("手動排序順序 (當時間為空時依此顯示)");
            entity.Property(e => e.SpotId).HasComment("景點快照編號 (Places_Snapshot.SpotId)");
            entity.Property(e => e.StartTime)
                .HasPrecision(0)
                .HasComment("預計開始時間 (HH:mm)");
            entity.Property(e => e.TripId).HasComment("隸屬行程編號 (Trips.Id)");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("(sysdatetimeoffset())")
                .HasComment("資料最後更新時間");
            entity.Property(e => e.UpdatedByUserId).HasComment("最後執行修改的使用者編號 (用於多人編輯紀錄)");

            entity.HasOne(d => d.Spot).WithMany(p => p.ItineraryItems)
                .HasForeignKey(d => d.SpotId)
                .HasConstraintName("FK_ItineraryItems_PlacesSnapshot");

            entity.HasOne(d => d.Trip).WithMany(p => p.ItineraryItems)
                .HasForeignKey(d => d.TripId)
                .HasConstraintName("FK_ItineraryItems_Trips");
        });

        modelBuilder.Entity<LeaveDate>(entity =>
        {
            entity.HasKey(e => e.LeaveId).HasName("PK__LeaveDat__796DB95999CB32BE");

            entity.Property(e => e.LeaveDate1).HasColumnName("LeaveDate");
            entity.Property(e => e.LeaveDateAt)
                .HasDefaultValueSql("(getdate())")
                .HasColumnType("datetime");

            entity.HasOne(d => d.User).WithMany(p => p.LeaveDates)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_LeaveDates_AspNetUsers");
        });

        modelBuilder.Entity<LocationCategory>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__Location__3214EC07AC9803DF");

            entity.ToTable(tb => tb.HasComment("地點分類字典表：定義景點、美食、飯店等類別"));

            entity.Property(e => e.Id).HasComment("分類自動編號主鍵");
            entity.Property(e => e.ColorCode)
                .HasMaxLength(7)
                .IsUnicode(false)
                .IsFixedLength()
                .HasComment("地圖標記或 UI 顯示用的色碼 (十六進位)");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("(sysdatetimeoffset())")
                .HasComment("建立時間");
            entity.Property(e => e.IconTag)
                .HasMaxLength(50)
                .IsUnicode(false)
                .HasComment("前端圖示代碼 (如 FontAwesome 標籤碼)");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true)
                .HasComment("是否啟用 (0=停用, 1=啟用)");
            entity.Property(e => e.NameEn)
                .HasMaxLength(50)
                .HasComment("分類英文名稱 (如：Restaurant)")
                .HasColumnName("Name_EN");
            entity.Property(e => e.NameZh)
                .HasMaxLength(50)
                .HasComment("分類中文名稱 (如：餐廳)")
                .HasColumnName("Name_ZH");
            entity.Property(e => e.SortOrder).HasComment("顯示排序權重 (越小越靠前)");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("(sysdatetimeoffset())")
                .HasComment("最後更新時間");
        });

        modelBuilder.Entity<MemberTimeSlot>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__MemberTi__3214EC07B553A1B3");

            entity.HasIndex(e => new { e.GroupId, e.StartAt, e.EndAt }, "IX_MemberTimeSlots_GroupId_StartAt");

            entity.HasIndex(e => new { e.GroupId, e.UserId }, "IX_MemberTimeSlots_GroupId_UserId");

            entity.HasIndex(e => new { e.StartAt, e.EndAt }, "IX_MemberTimeSlots_StartAt_EndAt");

            entity.Property(e => e.CreatedAt).HasPrecision(0);
            entity.Property(e => e.EndAt).HasPrecision(0);
            entity.Property(e => e.StartAt).HasPrecision(0);

            entity.HasOne(d => d.Group).WithMany(p => p.MemberTimeSlots)
                .HasForeignKey(d => d.GroupId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MemberTimeSlots_GroupId_TravelGroups");

            entity.HasOne(d => d.User).WithMany(p => p.MemberTimeSlots)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_MemberTimeSlots_AspNetUsers");
        });

        modelBuilder.Entity<PlacesSnapshot>(entity =>
        {
            entity.HasKey(e => e.SpotId).HasName("PK__Places_S__61645FE753F9688E");

            entity.ToTable("PlacesSnapshot", tb => tb.HasComment("景點與地點快照庫：快取來自 Google Places 的資訊以節省 API 成本"));

            entity.HasIndex(e => e.LocationCategoryId, "IX_Places_LocationCategory");

            entity.HasIndex(e => e.ExternalPlaceId, "UQ__Places_S__577A2CE8282173DA").IsUnique();

            entity.Property(e => e.SpotId)
                .HasComment("內部唯一編號 (主鍵)")
                .HasColumnName("SpotID");
            entity.Property(e => e.AddressSnapshot)
                .HasMaxLength(500)
                .HasComment("地點完整地址快照");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("(sysdatetimeoffset())")
                .HasComment("建立時間");
            entity.Property(e => e.ExternalPlaceId)
                .HasMaxLength(255)
                .IsUnicode(false)
                .HasComment("Google Places 原始 PlaceID (用於防重與同步)")
                .HasColumnName("ExternalPlaceID");
            entity.Property(e => e.Lat)
                .HasComment("緯度")
                .HasColumnType("decimal(9, 6)");
            entity.Property(e => e.Lng)
                .HasComment("經度")
                .HasColumnType("decimal(9, 6)");
            entity.Property(e => e.LocationCategoryId).HasComment("地點分類 ID (關聯 LocationCategories 表)");
            entity.Property(e => e.NameEn)
                .HasMaxLength(255)
                .HasComment("景點英文名稱")
                .HasColumnName("Name_EN");
            entity.Property(e => e.NameZh)
                .HasMaxLength(255)
                .HasComment("景點中文名稱")
                .HasColumnName("Name_ZH");
            entity.Property(e => e.PhotosSnapshot).HasComment("圖片快照：存儲 photo_reference 的 JSON 陣列");
            entity.Property(e => e.Rating)
                .HasComment("Google 評分 (1.0 - 5.0)")
                .HasColumnType("decimal(2, 1)");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("(sysdatetimeoffset())")
                .HasComment("最後更新時間");
            entity.Property(e => e.UserRatingsTotal).HasComment("總評價人數");

            entity.HasOne(d => d.LocationCategory).WithMany(p => p.PlacesSnapshots)
                .HasForeignKey(d => d.LocationCategoryId)
                .HasConstraintName("FK_Places_LocationCategories");
        });

        modelBuilder.Entity<Preference>(entity =>
        {
            entity.HasKey(e => new { e.UserId, e.GroupId });

            entity.HasIndex(e => e.GroupId, "IX_Preferences_GroupId");

            entity.HasIndex(e => new { e.GroupId, e.Tranfer }, "IX_Preferences_GroupId_Tranfer");

            entity.HasIndex(e => new { e.UserId, e.CreatedAt }, "IX_Preferences_UserId_CreatedAt").IsDescending(false, true);

            entity.Property(e => e.CreatedAt).HasPrecision(0);
            entity.Property(e => e.PlacesToGo).HasMaxLength(500);

            entity.HasOne(d => d.Group).WithMany(p => p.Preferences)
                .HasForeignKey(d => d.GroupId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Preferences_GroupId_TravelGroups");

            entity.HasOne(d => d.User).WithMany(p => p.Preferences)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Preferences_AspNetUsers");
        });

        modelBuilder.Entity<Recommandation>(entity =>
        {
            entity.HasKey(e => e.Index).HasName("PK__Recomman__9A5B622810AB7292");

            entity.HasIndex(e => e.GroupId, "IX_Recommandations_GroupId");

            entity.HasIndex(e => new { e.GroupId, e.StartDate, e.EndDate }, "IX_Recommandations_GroupId_DateRange");

            entity.HasIndex(e => new { e.GroupId, e.Vote, e.Price }, "IX_Recommandations_GroupId_Vote_Price");

            entity.Property(e => e.CreatedAt).HasPrecision(0);
            entity.Property(e => e.DepartFlight).HasMaxLength(200);
            entity.Property(e => e.EndDate).HasPrecision(0);
            entity.Property(e => e.Hotel).HasMaxLength(200);
            entity.Property(e => e.Location).HasMaxLength(100);
            entity.Property(e => e.Price).HasColumnType("decimal(18, 2)");
            entity.Property(e => e.ReturnFlight).HasMaxLength(200);
            entity.Property(e => e.StartDate).HasPrecision(0);
            entity.Property(e => e.UpdatedAt).HasPrecision(0);

            entity.HasOne(d => d.Group).WithMany(p => p.Recommandations)
                .HasForeignKey(d => d.GroupId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Recommandations_GroupId_TravelGroups");
        });

        modelBuilder.Entity<Settlement>(entity =>
        {
            entity.HasKey(e => e.SettlementId).HasName("PK__Settleme__7712545A2E31B583");

            entity.HasIndex(e => new { e.TripId, e.IsPaid }, "IX_Settlements_Trip_PayStatus");

            entity.Property(e => e.Amount).HasColumnType("decimal(18, 2)");
            entity.Property(e => e.FromUserId).HasComment("債務人 (付錢的人)");
            entity.Property(e => e.IsPaid)
                .HasDefaultValue(false)
                .HasComment("結算狀態(0:未支付, 1:已支付)");
            entity.Property(e => e.ToUserId).HasComment("債權人 (領錢的人)");
            entity.Property(e => e.UpdatedAt).HasDefaultValueSql("(sysdatetimeoffset())");

            entity.HasOne(d => d.FromUser).WithMany(p => p.SettlementFromUsers)
                .HasForeignKey(d => d.FromUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Settlements_FromMember");

            entity.HasOne(d => d.ToUser).WithMany(p => p.SettlementToUsers)
                .HasForeignKey(d => d.ToUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Settlements_ToMember");

            entity.HasOne(d => d.Trip).WithMany(p => p.Settlements)
                .HasForeignKey(d => d.TripId)
                .HasConstraintName("FK_Settlements_Trips");
        });

        modelBuilder.Entity<TravelGroup>(entity =>
        {
            entity.HasKey(e => e.GroupId).HasName("PK__TravelGr__149AF36ABC2D3D1A");

            entity.HasIndex(e => e.InviteCode, "IX_TravelGroups_InviteCode").IsUnique();

            entity.HasIndex(e => new { e.OwnerUserId, e.CreatedAt }, "IX_TravelGroups_OwnerUserId_CreatedAt").IsDescending(false, true);

            entity.HasIndex(e => new { e.Status, e.DateStart, e.DateEnd }, "IX_TravelGroups_Status_DateRange");

            entity.HasIndex(e => e.InviteCode, "UQ_TravelGroups_InviteCode").IsUnique();

            entity.Property(e => e.CreatedAt).HasPrecision(0);
            entity.Property(e => e.DateEnd).HasPrecision(0);
            entity.Property(e => e.DateStart).HasPrecision(0);
            entity.Property(e => e.DepartFrom).HasMaxLength(100);
            entity.Property(e => e.InviteCode)
                .HasMaxLength(12)
                .IsUnicode(false);
            entity.Property(e => e.Status).HasMaxLength(20);
            entity.Property(e => e.Title).HasMaxLength(100);
            entity.Property(e => e.UpdateAt).HasPrecision(0);

            entity.HasOne(d => d.OwnerUser).WithMany(p => p.TravelGroups)
                .HasForeignKey(d => d.OwnerUserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TravelGroups_AspNetUsers");
        });

        modelBuilder.Entity<Trip>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__Trips__3214EC07F209E5B2");

            entity.ToTable(tb => tb.HasComment("行程主表：儲存旅遊行程的核心資訊"));

            entity.HasIndex(e => e.InviteCode, "IX_Trips_InviteCode");

            entity.Property(e => e.Id).HasComment("行程自動編號主鍵");
            entity.Property(e => e.CoverImageUrl)
                .HasMaxLength(500)
                .HasComment("行程封面圖片 URL");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("(sysdatetimeoffset())")
                .HasComment("資料建立時間");
            entity.Property(e => e.EndDate).HasComment("行程結束日期");
            entity.Property(e => e.InviteCode)
                .HasDefaultValueSql("(newid())")
                .HasComment("專屬邀請連結代碼 (GUID)，用於分享給朋友加入共編");
            entity.Property(e => e.RowVersion)
                .IsRowVersion()
                .IsConcurrencyToken()
                .HasComment("版本戳記，用於多人共同編輯時的衝突檢查 (RowVersion)");
            entity.Property(e => e.StartDate).HasComment("行程起始日期");
            entity.Property(e => e.Title)
                .HasMaxLength(200)
                .HasComment("行程顯示標題");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("(sysdatetimeoffset())")
                .HasComment("資料最後更新時間");
        });

        modelBuilder.Entity<TripMember>(entity =>
        {
            entity.ToTable(tb => tb.HasComment("行程成員與權限表"));

            entity.HasIndex(e => e.UserId, "IX_TripMembers_UserId_Role");

            entity.HasIndex(e => new { e.TripId, e.UserId }, "UQ_TripMembers_TripUser").IsUnique();

            entity.Property(e => e.Id).HasComment("自動編號主鍵");
            entity.Property(e => e.JoinedAt)
                .HasDefaultValueSql("(sysdatetimeoffset())")
                .HasComment("成員加入行程的時間 (包含時區資訊)");
            entity.Property(e => e.RoleType)
                .HasDefaultValue((byte)2)
                .HasComment("角色：1=Owner, 2=Editor, 3=Viewer");
            entity.Property(e => e.TripId).HasComment("行程 ID");
            entity.Property(e => e.UserId).HasComment("使用者 ID");

            entity.HasOne(d => d.Trip).WithMany(p => p.TripMembers)
                .HasForeignKey(d => d.TripId)
                .HasConstraintName("FK_TripMembers_Trips");
        });

        modelBuilder.Entity<TripRegion>(entity =>
        {
            entity.HasKey(e => new { e.TripId, e.RegionId }).HasName("PK__TripRegi__7B11F5743E5F3B33");

            entity.ToTable(tb => tb.HasComment("行程區域關聯表：紀錄該行程感興趣或計畫前往的行政區域（城市）"));

            entity.Property(e => e.TripId).HasComment("行程編號 (外鍵，連結至 Trips.Id)");
            entity.Property(e => e.RegionId).HasComment("區域編號 (外鍵，連結至 GlobalRegions.Id)");
            entity.Property(e => e.RowVersion)
                .IsRowVersion()
                .IsConcurrencyToken()
                .HasComment("樂觀並行控制版本號：防止多人同時編輯行程區域時產生資料覆蓋");

            entity.HasOne(d => d.Region).WithMany(p => p.TripRegions)
                .HasForeignKey(d => d.RegionId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_TripRegions_Global");

            entity.HasOne(d => d.Trip).WithMany(p => p.TripRegions)
                .HasForeignKey(d => d.TripId)
                .HasConstraintName("FK_TripRegions_Trips");
        });

        modelBuilder.Entity<Wishlist>(entity =>
        {
            entity.HasKey(e => e.WishlistItemId).HasName("PK__Wishlist__171E21A180761268");

            entity.ToTable("Wishlist", tb => tb.HasComment("願望清單表：儲存使用者感興趣的地點快照，支援私人備註與防重複收藏機制。"));

            entity.HasIndex(e => e.CreatedAt, "IX_Wishlist_CreatedAt").IsDescending();

            entity.HasIndex(e => e.UserId, "IX_Wishlist_UserId");

            entity.HasIndex(e => new { e.UserId, e.SpotId }, "UQ_Wishlist_User_Spot").IsUnique();

            entity.Property(e => e.CreatedAt).HasDefaultValueSql("(sysdatetimeoffset())");
            entity.Property(e => e.Note).HasMaxLength(500);
            entity.Property(e => e.UpdatedAt).HasDefaultValueSql("(sysdatetimeoffset())");

            entity.HasOne(d => d.Spot).WithMany(p => p.Wishlists)
                .HasForeignKey(d => d.SpotId)
                .HasConstraintName("FK_Wishlist_Places");

            entity.HasOne(d => d.User).WithMany(p => p.Wishlists)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Wishlist_AspNetUsers");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
