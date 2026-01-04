import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { FileExplorer } from '../components/FileExplorer';
import { FilePreviewModal } from '../components/FilePreviewModal';
import { apiClient } from '../lib/api-client';
import { FileInfo } from '../types/api';

// Mock the API client
vi.mock('../lib/api-client', () => ({
  apiClient: {
    downloadFile: vi.fn(),
  },
}));

const mockApiClient = apiClient as any;

describe('File Download Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock URL.createObjectURL and related methods
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const mockRevokeObjectURL = vi.fn();
    
    Object.defineProperty(window, 'URL', {
      value: {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      },
      writable: true,
    });

    // Mock document.createElement and related methods
    const mockLink = {
      href: '',
      download: '',
      click: vi.fn(),
    };
    const mockCreateElement = vi.fn().mockReturnValue(mockLink);
    const mockAppendChild = vi.fn();
    const mockRemoveChild = vi.fn();
    
    Object.defineProperty(document, 'createElement', {
      value: mockCreateElement,
      writable: true,
    });
    Object.defineProperty(document.body, 'appendChild', {
      value: mockAppendChild,
      writable: true,
    });
    Object.defineProperty(document.body, 'removeChild', {
      value: mockRemoveChild,
      writable: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  /**
   * Test 9: File download functionality
   * Validates: Requirements 2.3
   */
  test('should download file when download button is clicked', async () => {
    const mockFiles: FileInfo[] = [
      {
        name: 'document.txt',
        path: '/home/document.txt',
        size: 1024,
        is_directory: false,
        modified: 1600000000,
      },
    ];

    const mockBlob = new Blob(['file content'], { type: 'text/plain' });
    mockApiClient.downloadFile.mockResolvedValue(mockBlob);

    const mockOnPathChange = vi.fn();
    const mockOnRefresh = vi.fn();

    render(
      <FileExplorer
        deviceId="test-device"
        currentPath="/home"
        files={mockFiles}
        loading={false}
        onPathChange={mockOnPathChange}
        onRefresh={mockOnRefresh}
      />
    );

    // Find and click download button
    const downloadButton = screen.getByTitle('下载文件');
    fireEvent.click(downloadButton);

    // Wait for API call
    await waitFor(() => {
      expect(mockApiClient.downloadFile).toHaveBeenCalledWith('test-device', '/home/document.txt');
    });

    // Verify download process
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(document.body.appendChild).toHaveBeenCalled();
    expect(document.body.removeChild).toHaveBeenCalled();
    expect(window.URL.revokeObjectURL).toHaveBeenCalled();

    // Verify the download link was configured correctly
    const mockLink = document.createElement('a') as any;
    expect(mockLink.download).toBe('document.txt');
    expect(mockLink.click).toHaveBeenCalled();
  });

  test('should handle batch download', async () => {
    const mockFiles: FileInfo[] = [
      {
        name: 'file1.txt',
        path: '/home/file1.txt',
        size: 1024,
        is_directory: false,
        modified: 1600000000,
      },
      {
        name: 'file2.txt',
        path: '/home/file2.txt',
        size: 2048,
        is_directory: false,
        modified: 1600000000,
      },
    ];

    const mockBlob = new Blob(['file content'], { type: 'text/plain' });
    mockApiClient.downloadFile.mockResolvedValue(mockBlob);

    const mockOnPathChange = vi.fn();
    const mockOnRefresh = vi.fn();

    render(
      <FileExplorer
        deviceId="test-device"
        currentPath="/home"
        files={mockFiles}
        loading={false}
        onPathChange={mockOnPathChange}
        onRefresh={mockOnRefresh}
      />
    );

    // Select all files
    fireEvent.click(screen.getByText('全选'));

    // Wait for selection to update
    await waitFor(() => {
      expect(screen.getByText('取消全选')).toBeInTheDocument();
    });

    // Click batch download
    const batchDownloadButton = screen.getByText('批量下载');
    fireEvent.click(batchDownloadButton);

    // Wait for all downloads to complete
    await waitFor(() => {
      expect(mockApiClient.downloadFile).toHaveBeenCalledTimes(2);
    });

    // Verify each file was downloaded
    expect(mockApiClient.downloadFile).toHaveBeenCalledWith('test-device', '/home/file1.txt');
    expect(mockApiClient.downloadFile).toHaveBeenCalledWith('test-device', '/home/file2.txt');
  });

  test('should handle download errors gracefully', async () => {
    const mockFiles: FileInfo[] = [
      {
        name: 'error.txt',
        path: '/home/error.txt',
        size: 1024,
        is_directory: false,
        modified: 1600000000,
      },
    ];

    mockApiClient.downloadFile.mockRejectedValue(new Error('Download failed'));

    const mockOnPathChange = vi.fn();
    const mockOnRefresh = vi.fn();

    render(
      <FileExplorer
        deviceId="test-device"
        currentPath="/home"
        files={mockFiles}
        loading={false}
        onPathChange={mockOnPathChange}
        onRefresh={mockOnRefresh}
      />
    );

    // Find and click download button
    const downloadButton = screen.getByTitle('下载文件');
    fireEvent.click(downloadButton);

    // Wait for API call
    await waitFor(() => {
      expect(mockApiClient.downloadFile).toHaveBeenCalledWith('test-device', '/home/error.txt');
    });

    // Should not create download link on error
    expect(document.createElement).not.toHaveBeenCalledWith('a');
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();
  });

  test('should show download progress indicator', async () => {
    const mockFiles: FileInfo[] = [
      {
        name: 'large.txt',
        path: '/home/large.txt',
        size: 10 * 1024 * 1024, // 10MB
        is_directory: false,
        modified: 1600000000,
      },
    ];

    // Mock download with delay
    mockApiClient.downloadFile.mockImplementation(() => 
      new Promise(resolve => 
        setTimeout(() => resolve(new Blob(['content'])), 200)
      )
    );

    const mockOnPathChange = vi.fn();
    const mockOnRefresh = vi.fn();

    render(
      <FileExplorer
        deviceId="test-device"
        currentPath="/home"
        files={mockFiles}
        loading={false}
        onPathChange={mockOnPathChange}
        onRefresh={mockOnRefresh}
      />
    );

    // Find and click download button
    const downloadButton = screen.getByTitle('下载文件');
    fireEvent.click(downloadButton);

    // Should show loading state (spinning icon)
    await waitFor(() => {
      const spinningIcon = downloadButton.querySelector('.animate-spin');
      expect(spinningIcon).toBeInTheDocument();
    });

    // Wait for download to complete
    await waitFor(() => {
      expect(mockApiClient.downloadFile).toHaveBeenCalled();
    }, { timeout: 1000 });

    // Loading state should be cleared
    await waitFor(() => {
      const spinningIcon = downloadButton.querySelector('.animate-spin');
      expect(spinningIcon).not.toBeInTheDocument();
    });
  });
});

describe('File Preview Modal Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup download mocks
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const mockRevokeObjectURL = vi.fn();
    
    Object.defineProperty(window, 'URL', {
      value: {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      },
      writable: true,
    });

    const mockLink = {
      href: '',
      download: '',
      click: vi.fn(),
    };
    const mockCreateElement = vi.fn().mockReturnValue(mockLink);
    const mockAppendChild = vi.fn();
    const mockRemoveChild = vi.fn();
    
    Object.defineProperty(document, 'createElement', {
      value: mockCreateElement,
      writable: true,
    });
    Object.defineProperty(document.body, 'appendChild', {
      value: mockAppendChild,
      writable: true,
    });
    Object.defineProperty(document.body, 'removeChild', {
      value: mockRemoveChild,
      writable: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  test('should display file preview modal', () => {
    const mockFile: FileInfo = {
      name: 'document.txt',
      path: '/home/document.txt',
      size: 1024,
      is_directory: false,
      modified: 1600000000,
    };

    const mockOnClose = vi.fn();

    render(
      <FilePreviewModal
        isOpen={true}
        onClose={mockOnClose}
        file={mockFile}
        deviceId="test-device"
      />
    );

    // Should show file name and details
    expect(screen.getByText('document.txt')).toBeInTheDocument();
    expect(screen.getByText('1 KB')).toBeInTheDocument();

    // Should show download and close buttons
    expect(screen.getByText('下载')).toBeInTheDocument();
    expect(screen.getByText('关闭')).toBeInTheDocument();
  });

  test('should handle download from preview modal', async () => {
    const mockFile: FileInfo = {
      name: 'test.pdf',
      path: '/documents/test.pdf',
      size: 2048,
      is_directory: false,
      modified: 1600000000,
    };

    const mockBlob = new Blob(['pdf content'], { type: 'application/pdf' });
    mockApiClient.downloadFile.mockResolvedValue(mockBlob);

    const mockOnClose = vi.fn();

    render(
      <FilePreviewModal
        isOpen={true}
        onClose={mockOnClose}
        file={mockFile}
        deviceId="test-device"
      />
    );

    // Click download button
    const downloadButton = screen.getByText('下载');
    fireEvent.click(downloadButton);

    // Wait for download
    await waitFor(() => {
      expect(mockApiClient.downloadFile).toHaveBeenCalledWith('test-device', '/documents/test.pdf');
    });

    // Verify download process
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
    expect(document.createElement).toHaveBeenCalledWith('a');
  });

  test('should close modal when close button is clicked', () => {
    const mockFile: FileInfo = {
      name: 'image.jpg',
      path: '/pictures/image.jpg',
      size: 5120,
      is_directory: false,
      modified: 1600000000,
    };

    const mockOnClose = vi.fn();

    render(
      <FilePreviewModal
        isOpen={true}
        onClose={mockOnClose}
        file={mockFile}
        deviceId="test-device"
      />
    );

    // Click close button
    const closeButton = screen.getByText('关闭');
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });
});