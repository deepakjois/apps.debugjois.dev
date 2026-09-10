// Package gdrive stores daily logs in the Obsidian shared Google Drive.
package gdrive

import (
	"bytes"
	"context"
	"fmt"
	"io"

	"golang.org/x/oauth2/google"
	"google.golang.org/api/drive/v3"
	"google.golang.org/api/option"
)

const (
	folderMIMEType  = "application/vnd.google-apps.folder"
	sharedDriveName = "obsidian"
	vaultFolderName = "PersonalKnowledgeWiki"
	dailyFolderName = "daily"
)

// Store holds the Drive client and IDs needed to access daily notes.
type Store struct {
	service       *drive.Service
	driveID       string
	dailyFolderID string
}

// New authenticates with Application Default Credentials and locates the daily-log folder.
func New(ctx context.Context) (*Store, error) {
	credentials, err := google.FindDefaultCredentials(ctx, drive.DriveScope)
	if err != nil {
		return nil, fmt.Errorf("google credentials not available: %w", err)
	}

	service, err := drive.NewService(ctx, option.WithCredentials(credentials))
	if err != nil {
		return nil, fmt.Errorf("create Drive service: %w", err)
	}

	driveList, err := service.Drives.List().Q(fmt.Sprintf(`name = "%s"`, sharedDriveName)).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("list shared drives: %w", err)
	}
	if len(driveList.Drives) == 0 {
		return nil, fmt.Errorf("shared drive %q not found", sharedDriveName)
	}
	driveID := driveList.Drives[0].Id

	vaultFolderID, err := findFolder(ctx, service, driveID, driveID, vaultFolderName)
	if err != nil {
		return nil, fmt.Errorf("find vault folder: %w", err)
	}
	dailyFolderID, err := findFolder(ctx, service, driveID, vaultFolderID, dailyFolderName)
	if err != nil {
		return nil, fmt.Errorf("find daily folder: %w", err)
	}

	return &Store{service: service, driveID: driveID, dailyFolderID: dailyFolderID}, nil
}

// Load downloads a daily log by filename.
func (s *Store) Load(ctx context.Context, title string) ([]byte, bool, error) {
	fileID, found, err := s.findFile(ctx, title)
	if err != nil || !found {
		return nil, found, err
	}

	response, err := s.service.Files.Get(fileID).
		SupportsAllDrives(true).
		Context(ctx).
		Download()
	if err != nil {
		return nil, false, fmt.Errorf("download %s from Drive: %w", title, err)
	}
	defer func() { _ = response.Body.Close() }()

	contents, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, false, fmt.Errorf("read %s content: %w", title, err)
	}

	return contents, true, nil
}

// Save replaces an existing daily log or creates it when absent.
func (s *Store) Save(ctx context.Context, title string, contents []byte) error {
	fileID, found, err := s.findFile(ctx, title)
	if err != nil {
		return err
	}

	if found {
		_, err = s.service.Files.Update(fileID, &drive.File{}).
			SupportsAllDrives(true).
			Media(bytes.NewReader(contents)).
			Context(ctx).
			Do()
		if err != nil {
			return fmt.Errorf("update %s on Drive: %w", title, err)
		}
		return nil
	}

	_, err = s.service.Files.Create(&drive.File{Name: title, Parents: []string{s.dailyFolderID}}).
		SupportsAllDrives(true).
		Media(bytes.NewReader(contents)).
		Context(ctx).
		Do()
	if err != nil {
		return fmt.Errorf("create %s on Drive: %w", title, err)
	}

	return nil
}

func findFolder(ctx context.Context, service *drive.Service, driveID, parentID, name string) (string, error) {
	query := fmt.Sprintf(`"%s" in parents and name = "%s" and mimeType = "%s" and trashed = false`, parentID, name, folderMIMEType)
	result, err := service.Files.List().
		Q(query).
		Corpora("drive").
		DriveId(driveID).
		IncludeItemsFromAllDrives(true).
		SupportsAllDrives(true).
		Fields("files(id)").
		Context(ctx).
		Do()
	if err != nil {
		return "", fmt.Errorf("query Drive for folder %q: %w", name, err)
	}
	if len(result.Files) == 0 {
		return "", fmt.Errorf("folder %q not found under parent %s", name, parentID)
	}

	return result.Files[0].Id, nil
}

func (s *Store) findFile(ctx context.Context, title string) (string, bool, error) {
	query := fmt.Sprintf(`"%s" in parents and name = "%s" and trashed = false`, s.dailyFolderID, title)
	result, err := s.service.Files.List().
		Q(query).
		Corpora("drive").
		DriveId(s.driveID).
		IncludeItemsFromAllDrives(true).
		SupportsAllDrives(true).
		Fields("files(id)").
		Context(ctx).
		Do()
	if err != nil {
		return "", false, fmt.Errorf("search Drive for %s: %w", title, err)
	}
	if len(result.Files) == 0 {
		return "", false, nil
	}

	return result.Files[0].Id, true, nil
}
