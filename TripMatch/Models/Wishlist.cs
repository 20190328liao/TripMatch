using System;
using System.Collections.Generic;

namespace TripMatch.Models;

/// <summary>
/// 願望清單表：儲存使用者感興趣的地點快照，支援私人備註與防重複收藏機制。
/// </summary>
public partial class Wishlist
{
    public int WishlistItemId { get; set; }

    public int UserId { get; set; }

    public int SpotId { get; set; }

    public string? Note { get; set; }

    public DateTimeOffset? CreatedAt { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    public virtual PlacesSnapshot Spot { get; set; } = null!;

    public virtual AspNetUser User { get; set; } = null!;
}
