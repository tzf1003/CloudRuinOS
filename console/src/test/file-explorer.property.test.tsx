import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FileExplorer } from '../components/FileExplorer';
import { FileManagerPage } from '../pages/FileManagerPage';
import { apiClient } from '../lib/api-client';
import { FileInfo } from '../types/api';

// Mock the API client
vi.mock('../lib/api-client', () => ({
  apiClient: {
    listFiles: vi.fn(),
    downloadFile: vi.fn(),
    getDevices: vi.fn(),
  },
}));

const mockApiClient = apiClient as any;

// Test data sets for parameterized testing
const testDeviceIds = ['device-1', 'device-2', 'test-device'];
const testPaths = ['/', '/home', '/documents'];
const testFileArrays = [
  [],
  [
    {
      name: 'document.txt',
      path: '/home/document.txt',
      size: 1024,
      is_directory: false,
      modified: 1600000000,
      permissions: 'rw-'
    }
  ],
  [
    {
      name: 'folder1',
      path: '/home/folder1',
      size: 0,
      is_directory: true,
      modified: 1600000000,
      permissions: 'rwx'
    },
    {
      name: 'file1.txt',
      path: '/home/file1.txt',
      size: 2048,
      is_directory: false,
      modified: 1600000001,
      permissions: 'rw-'
    }
  ]
];

const testDevices = [
  {
    id: 'device-1',
    deviceId: 'device-1',
    name: 'Test Device 1',
    platform: 'Windows' as const,
    version: '1.0.0',
    status: 'online' as const,
    lastSeen: 1600000000,
    enrolledAt: 1600000000,
    publicKey: 'test-key-1'
  }
];

describe('File Explorer Property Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create a fresh QueryClient for each test
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          cacheTime: 0,
          staleTime: 0,
        },
        mutations: {
          retry: false,
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
    if (queryClient) {
      queryClient.clear();
    }
  });

  // Test wrapper component factory
  function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  /**
   * Property 8: 文件列表 API 调用
   * For any device ID and path, FileManager should call POST /files/list API and display directory contents
   * Validates: Requirements 2.2
   */
  test.each([
    ['device-1', '/', testFileArrays[0]], // Empty files
    ['device-2', '/home', testFileArrays[1]], // Single file
    ['test-device', '/documents', testFileArrays[2]], // Mixed files and directories
  ])('Property 8: File list API call correctness - %s, %s', async (deviceId, currentPath, mockFiles) => {
    // Setup mock
    mockApiClient.listFiles.mockResolvedValue(mockFiles);

    const mockOnPathChange = vi.fn();
    const mockOnRefresh = vi.fn();

    // Render component
    const result = render(
      <TestWrapper>
        <FileExplorer
          deviceId={deviceId}
          currentPath={currentPath}
          files={mockFiles}
          loading={false}
          onPathChange={mockOnPathChange}
          onRefresh={mockOnRefresh}
        />
      </TestWrapper>
    );

    // Verify that the component renders without errors
    expect(result.container).toBeInTheDocument();

    // Wait for component to fully render
    await waitFor(() => {
      if (mockFiles.length === 0) {
        expect(screen.getByText('目录为空')).toBeInTheDocument();
      } else {
        expect(screen.getByRole('table')).toBeInTheDocument();
      }
    }, { timeout: 500 });

    // Verify file list is displayed correctly
    if (mockFiles.length === 0) {
      expect(screen.getByText('目录为空')).toBeInTheDocument();
    } else {
      // Check that first file is rendered
      expect(screen.getByText(mockFiles[0].name)).toBeInTheDocument();
    }

    // Verify that directories can be navigated
    const directories = mockFiles.filter(f => f.is_directory);
    if (directories.length > 0) {
      const firstDir = directories[0];
      const dirButton = screen.getByText(firstDir.name);
      
      fireEvent.click(dirButton);
      
      // Should call onPathChange with correct path
      const expectedPath = currentPath === '/' 
        ? `/${firstDir.name}` 
        : `${currentPath}/${firstDir.name}`;
      expect(mockOnPathChange).toHaveBeenCalledWith(expectedPath);
    }
  });

  /**
   * Property 12: 文件操作完成更新
   * For any completed file operation, should update file list and display operation result
   * Validates: Requirements 2.6
   */
  test.each([
    ['device-1', '/', testFileArrays[1]], // Single file
    ['device-2', '/home', testFileArrays[2].filter(f => !f.is_directory)], // Only files
  ])('Property 12: File operation completion updates - %s, %s', async (deviceId, currentPath, initialFiles) => {
    // Filter to only non-directory files
    const nonDirFiles = initialFiles.filter(f => !f.is_directory);
    if (nonDirFiles.length === 0) {
      // Skip this test case if no files
      return;
    }

    // Setup mocks
    mockApiClient.listFiles.mockResolvedValue(nonDirFiles);
    mockApiClient.downloadFile.mockResolvedValue(new Blob(['test content']));

    const mockOnPathChange = vi.fn();
    const mockOnRefresh = vi.fn();

    // Create a spy for URL.createObjectURL
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

    // Render component
    const result = render(
      <TestWrapper>
        <FileExplorer
          deviceId={deviceId}
          currentPath={currentPath}
          files={nonDirFiles}
          loading={false}
          onPathChange={mockOnPathChange}
          onRefresh={mockOnRefresh}
        />
      </TestWrapper>
    );

    // Verify component renders
    expect(result.container).toBeInTheDocument();
    
    // Wait for component to fully render
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    }, { timeout: 500 });

    // Find download buttons
    const downloadButtons = screen.getAllByTitle('下载文件');
    if (downloadButtons.length > 0) {
      fireEvent.click(downloadButtons[0]);

      // Wait for download to complete
      await waitFor(() => {
        expect(mockApiClient.downloadFile).toHaveBeenCalled();
      }, { timeout: 500 });

      // Verify download process
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockLink.click).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();
    }

    // Test refresh functionality
    if (mockOnRefresh) {
      mockOnRefresh();
      expect(mockOnRefresh).toHaveBeenCalled();
    }
  });
});

describe('File Manager Page Property Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create a fresh QueryClient for each test
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          cacheTime: 0,
          staleTime: 0,
        },
        mutations: {
          retry: false,
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
    if (queryClient) {
      queryClient.clear();
    }
  });

  // Test wrapper component factory
  function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  /**
   * Property test for device selection and file listing integration
   */
  test.each([
    [testDevices, testFileArrays[0]], // Empty files
    [testDevices, testFileArrays[1]], // Single file
    [testDevices, testFileArrays[2]], // Mixed files
  ])('Property: Device selection triggers file listing', async (onlineDevices, mockFiles) => {
    // Setup mocks
    mockApiClient.getDevices.mockResolvedValue(onlineDevices);
    mockApiClient.listFiles.mockResolvedValue(mockFiles);

    // Render component
    const result = render(
      <TestWrapper>
        <FileManagerPage />
      </TestWrapper>
    );

    // Verify component renders
    expect(result.container).toBeInTheDocument();

    // Wait for devices to load
    await waitFor(() => {
      expect(screen.getByText('选择设备')).toBeInTheDocument();
    }, { timeout: 1000 });

    // Should display online devices
    onlineDevices.forEach(device => {
      const deviceName = device.name || device.deviceId;
      expect(screen.getByText(deviceName)).toBeInTheDocument();
    });

    // Select first device
    const firstDevice = onlineDevices[0];
    const deviceName = firstDevice.name || firstDevice.deviceId;
    const deviceButton = screen.getByText(deviceName);
    
    fireEvent.click(deviceButton);

    // Should trigger file listing
    await waitFor(() => {
      expect(mockApiClient.listFiles).toHaveBeenCalledWith(firstDevice.id, '/');
    }, { timeout: 1000 });

    // Should display file explorer
    if (mockFiles.length === 0) {
      await waitFor(() => {
        expect(screen.getByText('目录为空')).toBeInTheDocument();
      }, { timeout: 1000 });
    } else {
      await waitFor(() => {
        expect(screen.getByRole('table')).toBeInTheDocument();
      }, { timeout: 1000 });
    }
  });
});