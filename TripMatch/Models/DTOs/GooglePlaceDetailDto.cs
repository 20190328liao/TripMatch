//測試願望清單跑圖
// DTO for Google Places API response
public class GooglePlaceDetailDto
{
    public GooglePlaceResult? Result { get; set; }
    public string Status { get; set; } = string.Empty;
}

public class GooglePlaceResult
{
    public string Name { get; set; } = string.Empty;
    public List<GoogleAddressComponent> AddressComponents { get; set; } = new();
    public List<string> Types { get; set; } = new();
    public List<GooglePhoto> Photos { get; set; } = new(); // 新增 photos
}

public class GooglePhoto
{
    public string PhotoReference { get; set; } = string.Empty;
    // 可加其他欄位如 Width, Height
}

public class GoogleAddressComponent
{
    public List<string> Types { get; set; } = new();
    public string LongName { get; set; } = string.Empty;
    public string ShortName { get; set; } = string.Empty;
}