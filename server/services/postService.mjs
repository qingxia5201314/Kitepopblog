export function createPostService({ store }) {
  return {
    listPosts(options) {
      return store.list(options);
    },
    createPost(draft) {
      return store.create(draft);
    },
    updatePost(id, patch) {
      return store.update(id, patch);
    },
    removePost(id) {
      return store.remove(id);
    },
    listComments(idOrSlug) {
      return store.listComments(idOrSlug);
    },
    createComment(idOrSlug, draft, user) {
      return store.createComment(idOrSlug, draft, user);
    },
    updateComment(commentId, patch, user) {
      return store.updateComment(commentId, patch, user);
    },
    removeComment(commentId, user) {
      return store.removeComment(commentId, user);
    }
  };
}
