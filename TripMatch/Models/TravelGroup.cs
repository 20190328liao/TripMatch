using System;
using System.Collections.Generic;

namespace TripMatch.Models;

public partial class TravelGroup
{
    public int GroupId { get; set; }

    public int OwnerUserId { get; set; }

    public string InviteCode { get; set; } = null!;

    public int TargetNumber { get; set; }

    public string Title { get; set; } = null!;

    public DateTime DateStart { get; set; }

    public DateTime DateEnd { get; set; }

    public int TravelDays { get; set; }

    public string DepartFrom { get; set; } = null!;

    public string Status { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime UpdateAt { get; set; }

    public virtual ICollection<GroupMember> GroupMemberGroups { get; set; } = new List<GroupMember>();

    public virtual ICollection<GroupMember> GroupMemberInviteCodeNavigations { get; set; } = new List<GroupMember>();

    public virtual ICollection<MemberTimeSlot> MemberTimeSlots { get; set; } = new List<MemberTimeSlot>();

    public virtual AspNetUser OwnerUser { get; set; } = null!;

    public virtual ICollection<Preference> Preferences { get; set; } = new List<Preference>();

    public virtual ICollection<Recommendation> Recommendations { get; set; } = new List<Recommendation>();
}
