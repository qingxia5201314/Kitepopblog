export function createFileService({ fileStore }) {
  return {
    listFolder(folderId) {
      return fileStore.listFolder(folderId);
    },
    saveFile(upload) {
      return fileStore.saveFile(upload);
    },
    createAccessLink(id) {
      return fileStore.createAccessLink(id);
    },
    getFileForToken(id, token) {
      return fileStore.getFileForToken(id, token);
    },
    removeFile(id) {
      return fileStore.removeFile(id);
    }
  };
}
