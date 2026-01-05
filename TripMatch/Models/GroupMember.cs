using System;
using System.Collections.Generic;

namespace TripMatch.Models;

public partial class GroupMember
{
    public int GroupId { get; set; }

    public int UserId { get; set; }

    public string InviteCode { get; set; } = null!;

    public string Role { get; set; } = null!;

    public DateTime JoinedAt { get; set; }

    public DateTime? SubmittedAt { get; set; }

    public virtual TravelGroup Group { get; set; } = null!;

    public virtual TravelGroup InviteCodeNavigation { get; set; } = null!;

    public virtual AspNetUser User { get; set; } = null!;
}
