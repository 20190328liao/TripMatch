using System;
using System.Collections.Generic;

namespace TripMatch.Models;

public partial class ExpensePayer
{
    public int Id { get; set; }

    public int ExpenseId { get; set; }

    public int MemberId { get; set; }

    public decimal Amount { get; set; }

    public virtual Expense Expense { get; set; } = null!;

    public virtual TripMember Member { get; set; } = null!;
}
