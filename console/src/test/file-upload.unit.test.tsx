import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { FileUploadZone } from '../components/FileUploadZone';
import { apiClient } from '../lib/api-client';

// Mock the API client
vi.mock('../lib/api-client', () => ({
  apiClient: {
    uploadFile: vi.fn(),
  },
}));

const mockApiClient = apiClient as any;

// Mock crypto.subtle for checksum calculation
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    },
  },
  writable: true,
});

describe('File Upload Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock FileReader
    const mockFileReader = {
      readAsDataURL: vi.fn(),
      result: '',
      onload: null as any,
      onerror: null as any,
    };
    
    vi.stubGlobal('FileReader', vi.fn(() => mockFileReader));
    
    // Setup FileReader mock behavior
    mockFileReader.readAsDataURL.mockImplementation(function(this: any) {
      setTimeout(() => {
        this.result = 'data:text/plain;base64,dGVzdCBjb250ZW50'; // "test content" in base64
        if (this.onload) this.onload();
      }, 0);
    });
  });

  afterEach(() => {
    cleanup();
  });

  /**
   * Test 10: File upload functionality
   * Validates: Requirements 2.4
   */
  test('should display upload zone', () => {
    const mockOnUploadComplete = vi.fn();
    const mockOnUploadError = vi.fn();

    render(
      <FileUploadZone
        deviceId="test-device"
        targetPath="/home"
        onUploadComplete={mockOnUploadComplete}
        onUploadError={mockOnUploadError}
      />
    );

    expect(screen.getByText('拖拽文件到此处上传')).toBeInTheDocument();
    expect(screen.getByText('点击选择文件')).toBeInTheDocument();
  });

  test('should handle file upload', async () => {
    mockApiClient.uploadFile.mockResolvedValue(undefined);

    const mockOnUploadComplete = vi.fn();
    const mockOnUploadError = vi.fn();

    const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });

    render(
      <FileUploadZone
        deviceId="test-device"
        targetPath="/home"
        onUploadComplete={mockOnUploadComplete}
        onUploadError={mockOnUploadError}
      />
    );

    // Get file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    // Mock file selection
    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false,
    });

    fireEvent.change(fileInput);

    // Should show upload progress
    await waitFor(() => {
      expect(screen.getByText('上传进度')).toBeInTheDocument();
    });

    // Should show file name
    expect(screen.getByText('test.txt')).toBeInTheDocument();

    // Wait for upload completion
    await waitFor(() => {
      expect(mockApiClient.uploadFile).toHaveBeenCalledWith('test-device', '/home/test.txt', mockFile);
    });

    // Should call onUploadComplete
    await waitFor(() => {
      expect(mockOnUploadComplete).toHaveBeenCalled();
    });
  });

  /**
   * Test 11: File operation progress display
   * Validates: Requirements 2.5
   */
  test('should display upload progress', async () => {
    mockApiClient.uploadFile.mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 100))
    );

    const mockOnUploadComplete = vi.fn();
    const mockOnUploadError = vi.fn();

    const mockFile = new File(['test content'], 'document.pdf', { type: 'application/pdf' });

    render(
      <FileUploadZone
        deviceId="test-device"
        targetPath="/documents"
        onUploadComplete={mockOnUploadComplete}
        onUploadError={mockOnUploadError}
      />
    );

    // Simulate file drop
    const uploadZone = screen.getByText('拖拽文件到此处上传').closest('div');
    expect(uploadZone).toBeInTheDocument();

    if (uploadZone) {
      const mockDataTransfer = {
        files: [mockFile],
      };

      fireEvent.drop(uploadZone, {
        dataTransfer: mockDataTransfer,
      });

      // Should show upload progress
      await waitFor(() => {
        expect(screen.getByText('上传进度')).toBeInTheDocument();
      });

      // Should show file name and progress
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
      expect(screen.getByText('上传中...')).toBeInTheDocument();

      // Wait for completion
      await waitFor(() => {
        expect(screen.getByText('上传成功')).toBeInTheDocument();
      }, { timeout: 2000 });
    }
  });

  /**
   * Test 13: File operation error handling
   * Validates: Requirements 2.7
   */
  test('should handle upload errors', async () => {
    mockApiClient.uploadFile.mockRejectedValue(new Error('Upload failed'));

    const mockOnUploadComplete = vi.fn();
    const mockOnUploadError = vi.fn();

    const mockFile = new File(['test content'], 'error.txt', { type: 'text/plain' });

    render(
      <FileUploadZone
        deviceId="test-device"
        targetPath="/home"
        onUploadComplete={mockOnUploadComplete}
        onUploadError={mockOnUploadError}
      />
    );

    // Get file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    
    // Mock file selection
    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false,
    });

    fireEvent.change(fileInput);

    // Should show upload progress initially
    await waitFor(() => {
      expect(screen.getByText('上传进度')).toBeInTheDocument();
    });

    // Wait for upload to fail
    await waitFor(() => {
      expect(mockApiClient.uploadFile).toHaveBeenCalled();
    });

    // Should show error state
    await waitFor(() => {
      expect(screen.getByText('Upload failed')).toBeInTheDocument();
    }, { timeout: 2000 });

    // Should not call onUploadComplete
    expect(mockOnUploadComplete).not.toHaveBeenCalled();
  });

  test('should validate file size', async () => {
    const mockOnUploadComplete = vi.fn();
    const mockOnUploadError = vi.fn();

    // Create a file that's too large (5MB when limit is 1MB)
    const largeFile = new File(['x'.repeat(5 * 1024 * 1024)], 'large.txt', { type: 'text/plain' });

    render(
      <FileUploadZone
        deviceId="test-device"
        targetPath="/home"
        onUploadComplete={mockOnUploadComplete}
        onUploadError={mockOnUploadError}
        maxFileSize={1024 * 1024} // 1MB limit
      />
    );

    // Simulate file drop
    const uploadZone = screen.getByText('拖拽文件到此处上传').closest('div');
    
    if (uploadZone) {
      const mockDataTransfer = {
        files: [largeFile],
      };

      fireEvent.drop(uploadZone, {
        dataTransfer: mockDataTransfer,
      });

      // Should call onUploadError for oversized files
      await waitFor(() => {
        expect(mockOnUploadError).toHaveBeenCalled();
      });
      
      // Should not start upload
      expect(mockApiClient.uploadFile).not.toHaveBeenCalled();
    }
  });

  test('should validate file types', async () => {
    const mockOnUploadComplete = vi.fn();
    const mockOnUploadError = vi.fn();

    const executableFile = new File(['malicious code'], 'virus.exe', { type: 'application/x-msdownload' });

    render(
      <FileUploadZone
        deviceId="test-device"
        targetPath="/home"
        onUploadComplete={mockOnUploadComplete}
        onUploadError={mockOnUploadError}
        acceptedTypes={['.txt', '.pdf', '.jpg']}
      />
    );

    // Simulate file drop
    const uploadZone = screen.getByText('拖拽文件到此处上传').closest('div');
    
    if (uploadZone) {
      const mockDataTransfer = {
        files: [executableFile],
      };

      fireEvent.drop(uploadZone, {
        dataTransfer: mockDataTransfer,
      });

      // Should call onUploadError for unsupported file types
      await waitFor(() => {
        expect(mockOnUploadError).toHaveBeenCalled();
      });
      
      // Should not start upload
      expect(mockApiClient.uploadFile).not.toHaveBeenCalled();
    }
  });
});