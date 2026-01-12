using System;
using System.Collections.Generic;

namespace TripMatch.Models;

public partial class AspNetUser
{
    public int UserId { get; set; }

    public string? FullName { get; set; }

    public string? BackupEmail { get; set; }

    public string? Avatar { get; set; }

    public bool BackupEmailConfirmed { get; set; }

    public DateTime CreatedAt { get; set; }

    public string? UserName { get; set; }

    public string? NormalizedUserName { get; set; }

    public string? Email { get; set; }

    public string? NormalizedEmail { get; set; }

    public bool EmailConfirmed { get; set; }

    public string? PasswordHash { get; set; }

    public string? SecurityStamp { get; set; }

    public string? ConcurrencyStamp { get; set; }

    public string? PhoneNumber { get; set; }

    public bool PhoneNumberConfirmed { get; set; }

    public bool TwoFactorEnabled { get; set; }

    public DateTimeOffset? LockoutEnd { get; set; }

    public bool LockoutEnabled { get; set; }

    public int AccessFailedCount { get; set; }

    public virtual ICollection<AspNetUserClaim> AspNetUserClaims { get; set; } = new List<AspNetUserClaim>();

    public virtual ICollection<AspNetUserLogin> AspNetUserLogins { get; set; } = new List<AspNetUserLogin>();

    public virtual ICollection<AspNetUserToken> AspNetUserTokens { get; set; } = new List<AspNetUserToken>();

    public virtual ICollection<GroupMember> GroupMembers { get; set; } = new List<GroupMember>();

    public virtual ICollection<LeaveDate> LeaveDates { get; set; } = new List<LeaveDate>();

    public virtual ICollection<MemberTimeSlot> MemberTimeSlots { get; set; } = new List<MemberTimeSlot>();

    public virtual ICollection<Preference> Preferences { get; set; } = new List<Preference>();

    public virtual ICollection<TravelGroup> TravelGroups { get; set; } = new List<TravelGroup>();

    public virtual ICollection<TripMember> TripMembers { get; set; } = new List<TripMember>();

    public virtual ICollection<Wishlist> Wishlists { get; set; } = new List<Wishlist>();

    public virtual ICollection<AspNetRole> Roles { get; set; } = new List<AspNetRole>();
}
