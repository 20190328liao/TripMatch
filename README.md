AI生成說明：1/14
        Boostrap是一種框架，Razor cshtml是動態生成的網頁(可配合vue,react,版面配置生成多頁)，
        wwwroot是靜態檔案(放css,js,img)，
        使用.Net Core MVC專案時，Razor html會自動尋找wwwroot裡的靜態檔案，
       <link>標籤的href屬性可以使用"~/"來表示wwwroot目錄。　靜態檔案用點斜線./
        Razor html 檢視會由Scaffold鷹架產生範本，範本會自動包含Bootstrap CSS和JS檔案的引用，
        這些檔案通常位於wwwroot/lib/bootstrap目錄下。
        建立新的布局檔案_XXXX.cshtml時，可以根據專案需求添加版面配置路徑。
        微軟建立的範本，微軟的範本很亂，機器人自動產生。
