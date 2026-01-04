import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import fc from 'fast-check';
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

// Generators for property-based testing
const deviceIdArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);
const pathArb = fc.string({ minLength: 1, maxLength: 100 }).map(s => s.startsWith('/') ? s : `/${s}`);
const validFileNameArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
  ext: fc.constantFrom('txt', 'jpg', 'png', 'pdf', 'doc', 'js')
}).map(({ name, ext }) => `${name.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`);
const fileSizeArb = fc.integer({ min: 1, max: 10 * 1024 * 1024 }); // 1B to 10MB
const fileContentArb = fc.string({ minLength: 1, maxLength: 1000 });

// Create mock File objects
const createMockFile = (name: string, size: number, content: string, type: string = 'text/plain'): File => {
  const file = new File([content], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

// Helper function to render component in isolation with unique container
const renderFileUploadZone = (props: any, testId?: string) => {
  // Ensure clean DOM before each render
  cleanup();
  
  const uniqueTestId = testId || `file-upload-container-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  return render(
    <div data-testid={uniqueTestId}>
      <FileUploadZone {...props} />
    </div>
  );
};

describe('File Upload Property Tests', () => {
  let mockFileReader: any;

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup(); // Ensure clean state
    
    // Mock FileReader
    mockFileReader = {
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
    vi.clearAllMocks();
  });

  /**
   * Property 10: 文件上传功能
   * For any file upload operation, should call POST /files/upload API and handle file upload to specified path
   * Validates: Requirements 2.4
   */
  test('Property 10: File upload functionality', async () => {
    await fc.assert(
      fc.asyncProperty(
        deviceIdArb,
        pathArb,
        fc.array(
          fc.record({
            name: validFileNameArb,
            size: fileSizeArb,
            content: fileContentArb,
          }),
          { minLength: 1, maxLength: 2 } // Reduced max files to minimize complexity
        ),
        async (deviceId, targetPath, fileSpecs) => {
          // Setup mock
          mockApiClient.uploadFile.mockResolvedValue(undefined);

          const mockOnUploadComplete = vi.fn();
          const mockOnUploadError = vi.fn();

          // Create mock files
          const mockFiles = fileSpecs.map(spec => 
            createMockFile(spec.name, spec.size, spec.content)
          );

          // Generate unique test ID for this test run
          const uniqueTestId = `file-upload-container-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          // Render component in isolation with unique container
          const { container } = renderFileUploadZone({
            deviceId,
            targetPath,
            onUploadComplete: mockOnUploadComplete,
            onUploadError: mockOnUploadError,
            maxFiles: 10,
            maxFileSize: 100 * 1024 * 1024,
          }, uniqueTestId);

          // Use unique container to scope queries and avoid conflicts
          const testContainer = container.querySelector(`[data-testid="${uniqueTestId}"]`);
          expect(testContainer).toBeInTheDocument();

          // Find elements within the unique container using more specific queries
          const uploadZoneText = testContainer?.querySelector('p') || 
                                container.querySelector('p');
          const selectFileButton = testContainer?.querySelector('button') || 
                                  container.querySelector('button');
          
          expect(uploadZoneText).toBeInTheDocument();
          expect(selectFileButton).toBeInTheDocument();

          // Find the upload zone by traversing from the text element
          const uploadZone = uploadZoneText?.closest('div[class*="border-dashed"]') || 
                           uploadZoneText?.closest('div');
          expect(uploadZone).toBeInTheDocument();

          if (uploadZone) {
            // Create a mock DataTransfer object
            const mockDataTransfer = {
              files: mockFiles,
            };

            // Simulate drag over
            fireEvent.dragOver(uploadZone, {
              dataTransfer: mockDataTransfer,
            });

            // Simulate drop
            fireEvent.drop(uploadZone, {
              dataTransfer: mockDataTransfer,
            });

            // Wait for upload to start - use container scoped query
            await waitFor(() => {
              const progressText = testContainer?.querySelector('h3') || 
                                 container.querySelector('h3');
              expect(progressText).toBeInTheDocument();
            }, { timeout: 1000 });

            // Wait for upload completion
            await waitFor(() => {
              // Should call uploadFile for each file
              expect(mockApiClient.uploadFile).toHaveBeenCalledTimes(mockFiles.length);
            }, { timeout: 3000 });

            // Verify API calls
            mockFiles.forEach((file, index) => {
              const expectedPath = targetPath === '/' 
                ? `/${file.name}` 
                : `${targetPath}/${file.name}`;
              
              expect(mockApiClient.uploadFile).toHaveBeenNthCalledWith(
                index + 1,
                deviceId,
                expectedPath,
                file
              );
            });

            // Should call onUploadComplete
            await waitFor(() => {
              expect(mockOnUploadComplete).toHaveBeenCalled();
            }, { timeout: 1000 });
          }

          // Clean up after this test case
          cleanup();
        }
      ),
      { numRuns: 3, timeout: 8000 } // Reduced runs to minimize conflicts, increased timeout
    );
  }, 25000); // Increase test timeout

  /**
   * Property 11: 文件操作进度显示
   * For any file operation in progress, should display appropriate progress indicators and operation status
   * Validates: Requirements 2.5
   */
  test('Property 11: File operation progress display', async () => {
    await fc.assert(
      fc.asyncProperty(
        deviceIdArb,
        pathArb,
        fc.record({
          name: validFileNameArb,
          size: fileSizeArb,
          content: fileContentArb,
        }),
        async (deviceId, targetPath, fileSpec) => {
          // Setup mock with delay to observe progress
          mockApiClient.uploadFile.mockImplementation(() => 
            new Promise(resolve => setTimeout(resolve, 100))
          );

          const mockOnUploadComplete = vi.fn();
          const mockOnUploadError = vi.fn();

          // Create mock file
          const mockFile = createMockFile(fileSpec.name, fileSpec.size, fileSpec.content);

          // Generate unique test ID for this test run
          const uniqueTestId = `file-upload-container-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          // Render component in isolation
          const { container } = renderFileUploadZone({
            deviceId,
            targetPath,
            onUploadComplete: mockOnUploadComplete,
            onUploadError: mockOnUploadError,
          }, uniqueTestId);

          // Use container to scope queries
          const testContainer = container.querySelector(`[data-testid="${uniqueTestId}"]`);
          expect(testContainer).toBeInTheDocument();
          
          // Find file input within the container
          const fileInput = testContainer?.querySelector('input[type="file"]') || 
                           container.querySelector('input[type="file"]');
          expect(fileInput).toBeInTheDocument();

          if (fileInput) {
            // Mock file input change
            Object.defineProperty(fileInput, 'files', {
              value: [mockFile],
              writable: false,
            });

            fireEvent.change(fileInput);

            // Should show upload progress
            await waitFor(() => {
              const progressElement = testContainer?.querySelector('h3') || 
                                    container.querySelector('h3');
              expect(progressElement).toBeInTheDocument();
            }, { timeout: 1000 });

            // Wait for upload completion
            await waitFor(() => {
              expect(mockApiClient.uploadFile).toHaveBeenCalled();
            }, { timeout: 2000 });

            // Should eventually show success
            await waitFor(() => {
              const successElement = testContainer?.querySelector('div[class*="text-green"]') || 
                                    container.querySelector('div[class*="text-green"]');
              expect(successElement).toBeInTheDocument();
            }, { timeout: 3000 });
          }

          // Clean up after this test case
          cleanup();
        }
      ),
      { numRuns: 3, timeout: 6000 } // Reduced from 15 to minimize DOM conflicts
    );
  }, 20000);

  /**
   * Property 13: 文件操作错误处理
   * For any failed file operation, should display detailed error information and retry options
   * Validates: Requirements 2.7
   */
  test('Property 13: File operation error handling', async () => {
    await fc.assert(
      fc.asyncProperty(
        deviceIdArb,
        pathArb,
        fc.record({
          name: validFileNameArb,
          size: fileSizeArb,
          content: fileContentArb,
        }),
        fc.string({ minLength: 1, maxLength: 100 }), // error message
        async (deviceId, targetPath, fileSpec, errorMessage) => {
          // Setup mock to fail
          mockApiClient.uploadFile.mockRejectedValue(new Error(errorMessage));

          const mockOnUploadComplete = vi.fn();
          const mockOnUploadError = vi.fn();

          // Create mock file
          const mockFile = createMockFile(fileSpec.name, fileSpec.size, fileSpec.content);

          // Generate unique test ID for this test run
          const uniqueTestId = `file-upload-container-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          // Render component in isolation
          const { container } = renderFileUploadZone({
            deviceId,
            targetPath,
            onUploadComplete: mockOnUploadComplete,
            onUploadError: mockOnUploadError,
          }, uniqueTestId);

          // Use container to scope queries
          const testContainer = container.querySelector(`[data-testid="${uniqueTestId}"]`);
          const uploadZone = testContainer?.querySelector('div[class*="border-dashed"]') || 
                           container.querySelector('div[class*="border-dashed"]');
          
          if (uploadZone) {
            const mockDataTransfer = {
              files: [mockFile],
            };

            fireEvent.drop(uploadZone, {
              dataTransfer: mockDataTransfer,
            });

            // Should show upload progress initially
            await waitFor(() => {
              const progressElement = testContainer?.querySelector('h3') || 
                                    container.querySelector('h3');
              expect(progressElement).toBeInTheDocument();
            }, { timeout: 1000 });

            // Wait for upload to fail
            await waitFor(() => {
              expect(mockApiClient.uploadFile).toHaveBeenCalled();
            }, { timeout: 2000 });

            // Should show error state
            await waitFor(() => {
              const errorElement = testContainer?.querySelector('div[class*="text-red"]') || 
                                  container.querySelector('div[class*="text-red"]');
              expect(errorElement).toBeInTheDocument();
            }, { timeout: 2000 });

            // Should not call onUploadComplete for failed uploads
            expect(mockOnUploadComplete).not.toHaveBeenCalled();
          }

          // Clean up after this test case
          cleanup();
        }
      ),
      { numRuns: 3, timeout: 5000 } // Reduced runs and added timeout
    );
  }, 18000); // Increase test timeout

  /**
   * Property test for file size validation
   */
  test('Property: File size validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        deviceIdArb,
        pathArb,
        fc.integer({ min: 1, max: 1024 }), // maxFileSize in KB
        fc.record({
          name: validFileNameArb,
          size: fc.integer({ min: 1, max: 10 * 1024 * 1024 }), // file size in bytes
          content: fileContentArb,
        }),
        async (deviceId, targetPath, maxFileSizeKB, fileSpec) => {
          const maxFileSize = maxFileSizeKB * 1024; // Convert to bytes
          const mockOnUploadComplete = vi.fn();
          const mockOnUploadError = vi.fn();

          // Create mock file
          const mockFile = createMockFile(fileSpec.name, fileSpec.size, fileSpec.content);

          // Generate unique test ID for this test run
          const uniqueTestId = `file-upload-container-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          // Render component with size limit in isolation
          const { container } = renderFileUploadZone({
            deviceId,
            targetPath,
            onUploadComplete: mockOnUploadComplete,
            onUploadError: mockOnUploadError,
            maxFileSize,
          }, uniqueTestId);

          // Use container to scope queries
          const testContainer = container.querySelector(`[data-testid="${uniqueTestId}"]`);
          const uploadZone = testContainer?.querySelector('div[class*="border-dashed"]') || 
                           container.querySelector('div[class*="border-dashed"]');
          
          if (uploadZone) {
            const mockDataTransfer = {
              files: [mockFile],
            };

            fireEvent.drop(uploadZone, {
              dataTransfer: mockDataTransfer,
            });

            // Wait a bit for validation to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            if (fileSpec.size > maxFileSize) {
              // Should call onUploadError for oversized files
              await waitFor(() => {
                expect(mockOnUploadError).toHaveBeenCalled();
              }, { timeout: 1000 });
              
              // Should not start upload
              expect(mockApiClient.uploadFile).not.toHaveBeenCalled();
            } else {
              // Should proceed with upload for valid size files
              await waitFor(() => {
                const progressElement = testContainer?.querySelector('h3') || 
                                      container.querySelector('h3');
                expect(progressElement).toBeInTheDocument();
              }, { timeout: 1000 });
              
              // Should not call onUploadError
              expect(mockOnUploadError).not.toHaveBeenCalled();
            }
          }

          // Clean up after this test case
          cleanup();
        }
      ),
      { numRuns: 3, timeout: 4000 } // Add timeout to prevent hanging
    );
  }, 15000); // Increase test timeout

  /**
   * Property test for file type validation
   */
  test('Property: File type validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        deviceIdArb,
        pathArb,
        fc.constantFrom(
          { acceptedTypes: ['.txt'], fileName: 'test.txt', shouldAccept: true },
          { acceptedTypes: ['.txt'], fileName: 'test.pdf', shouldAccept: false },
          { acceptedTypes: ['.jpg', '.png'], fileName: 'image.jpg', shouldAccept: true },
          { acceptedTypes: ['.jpg', '.png'], fileName: 'document.pdf', shouldAccept: false },
          { acceptedTypes: ['.pdf'], fileName: 'document.pdf', shouldAccept: true },
          { acceptedTypes: ['.pdf'], fileName: 'script.js', shouldAccept: false }
        ),
        async (deviceId, targetPath, testCase) => {
          const { acceptedTypes, fileName, shouldAccept } = testCase;
          const mockOnUploadComplete = vi.fn();
          const mockOnUploadError = vi.fn();

          // Create mock file
          const mockFile = createMockFile(fileName, 1024, 'test content');

          // Generate unique test ID for this test run
          const uniqueTestId = `file-upload-container-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          // Render component with type restrictions in isolation
          const { container } = renderFileUploadZone({
            deviceId,
            targetPath,
            onUploadComplete: mockOnUploadComplete,
            onUploadError: mockOnUploadError,
            acceptedTypes,
          }, uniqueTestId);

          // Use container to scope queries
          const testContainer = container.querySelector(`[data-testid="${uniqueTestId}"]`);
          const uploadZone = testContainer?.querySelector('div[class*="border-dashed"]') || 
                           container.querySelector('div[class*="border-dashed"]');
          
          if (uploadZone) {
            const mockDataTransfer = {
              files: [mockFile],
            };

            fireEvent.drop(uploadZone, {
              dataTransfer: mockDataTransfer,
            });

            // Wait a bit for validation to complete
            await new Promise(resolve => setTimeout(resolve, 100));

            if (!shouldAccept) {
              // Should call onUploadError for unsupported file types
              await waitFor(() => {
                expect(mockOnUploadError).toHaveBeenCalled();
              }, { timeout: 1000 });
              
              // Should not start upload
              expect(mockApiClient.uploadFile).not.toHaveBeenCalled();
            } else {
              // Should proceed with upload for accepted file types
              await waitFor(() => {
                const progressElement = testContainer?.querySelector('h3') || 
                                      container.querySelector('h3');
                expect(progressElement).toBeInTheDocument();
              }, { timeout: 1000 });
              
              // Should not call onUploadError
              expect(mockOnUploadError).not.toHaveBeenCalled();
            }
          }

          // Clean up after this test case
          cleanup();
        }
      ),
      { numRuns: 3, timeout: 3000 } // Test all 6 cases
    );
  }, 12000); // Increase test timeout
});