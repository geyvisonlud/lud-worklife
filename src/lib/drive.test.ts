import { describe, expect, it } from "vitest";
import { canPreviewInline, driveLinkMime, drivePreviewUrl, driveSearchQuery, fileKind, folderQuery, hasDriveScope, isHttpUrl, linkTitle, parseDriveLink, safeFolderName } from "./drive";

describe("drive helpers", () => {
  it("reads file ids from Drive and Docs links", () => {
    expect(parseDriveLink("https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view?usp=sharing")).toBe("1AbCdEfGhIjKlMn");
    expect(parseDriveLink("https://docs.google.com/document/d/1Zyx_wvu-TSRQPon/edit")).toBe("1Zyx_wvu-TSRQPon");
    expect(parseDriveLink("https://docs.google.com/spreadsheets/d/1SheetIdHere123/edit#gid=0")).toBe("1SheetIdHere123");
    expect(parseDriveLink("https://drive.google.com/open?id=1OpenIdabcdefg")).toBe("1OpenIdabcdefg");
    expect(parseDriveLink("https://drive.google.com/drive/folders/1FolderIdxyz123")).toBe("1FolderIdxyz123");
    expect(parseDriveLink("https://example.com/file/d/1AbCdEfGhIjKlMn")).toBeNull();
    expect(parseDriveLink("not a link")).toBeNull();
  });
  it("builds safe search queries", () => {
    expect(driveSearchQuery("budget")).toContain("name contains 'budget'");
    expect(driveSearchQuery("João's \\ notes")).toContain("name contains 'João\\'s \\\\ notes'");
    expect(driveSearchQuery("  ")).not.toContain("name contains");
    expect(folderQuery("Q1 'plan'", "root")).toContain("name = 'Q1 \\'plan\\''");
  });
  it("labels file kinds and names", () => {
    expect(fileKind("application/vnd.google-apps.spreadsheet")).toBe("Sheet");
    expect(fileKind("application/pdf")).toBe("PDF");
    expect(fileKind("image/png")).toBe("Image");
    expect(fileKind("application/octet-stream", "report.docx")).toBe("Doc");
    expect(fileKind(null)).toBe("File");
    expect(safeFolderName("  Web / App  ")).toBe("Web - App");
    expect(linkTitle("https://www.example.com/a/b/")).toBe("example.com/a/b");
    expect(isHttpUrl("https://x.y/z")).toBe(true);
    expect(isHttpUrl("hello")).toBe(false);
  });
  it("needs both Drive scopes", () => {
    expect(hasDriveScope("openid https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly")).toBe(true);
    expect(hasDriveScope("https://www.googleapis.com/auth/drive.file")).toBe(false);
    expect(hasDriveScope(null)).toBe(false);
  });
});

describe("drive link types", () => {
  it("guesses the type from the address", () => {
    expect(driveLinkMime("https://docs.google.com/spreadsheets/d/1abc/edit").title).toBe("Google Sheet");
    expect(driveLinkMime("https://docs.google.com/document/d/1abc/edit").mimeType).toBe("application/vnd.google-apps.document");
    expect(driveLinkMime("https://drive.google.com/file/d/1abc/view")).toEqual({ mimeType: null, title: "Google Drive file" });
  });
});

describe("drive preview", () => {
  it("uses Drive's viewer, not for folders", () => {
    expect(drivePreviewUrl("1abc_DEF")).toBe("https://drive.google.com/file/d/1abc_DEF/preview");
    expect(canPreviewInline("application/vnd.google-apps.folder")).toBe(false);
    expect(canPreviewInline("application/pdf")).toBe(true);
    expect(canPreviewInline(null)).toBe(true);
  });
});
