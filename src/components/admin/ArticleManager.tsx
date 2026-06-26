import { BlogPost, PostStatus, getCategory, getCategoryIcon } from '../../lib/blog';
import { Icon } from '../shared';

interface ArticleManagerProps {
  adminPanelOpen: boolean;
  adminPosts: BlogPost[];
  adminStatusFilter: 'all' | PostStatus;
  expandedAdminPostId: string | null;
  onTogglePanel: () => void;
  onCreate: () => void;
  onSetStatusFilter: (status: 'all' | PostStatus) => void;
  onToggleExpandedPost: (postId: string) => void;
  onEdit: (post: BlogPost) => void;
  onUpdateStatus: (postId: string, status: PostStatus) => void;
  onRemove: (post: BlogPost) => void;
}

export function ArticleManager(props: ArticleManagerProps) {
  const {
    adminPanelOpen,
    adminPosts,
    adminStatusFilter,
    expandedAdminPostId,
    onTogglePanel,
    onCreate,
    onSetStatusFilter,
    onToggleExpandedPost,
    onEdit,
    onUpdateStatus,
    onRemove
  } = props;

  return (
    <section className={adminPanelOpen ? 'admin-group admin-content-group open' : 'admin-group admin-content-group'}>
      <div className="panel-heading">
        <h2>内容管理</h2>
        <button onClick={onTogglePanel} type="button">
          {adminPanelOpen ? '收起' : '展开'}
        </button>
      </div>
      {adminPanelOpen ? (
        <>
          <button className="ghost admin-create" onClick={onCreate} type="button">
            新建文章
          </button>
          <div className="segmented-control">
            {(['all', 'published', 'draft'] as const).map((status) => (
              <button
                className={adminStatusFilter === status ? 'active' : ''}
                key={status}
                onClick={() => onSetStatusFilter(status)}
                type="button"
              >
                {status === 'all' ? '全部' : status === 'published' ? '已发布' : '草稿'}
              </button>
            ))}
          </div>
          {adminPosts.map((post) => {
            const category = getCategory(post.category);
            const isPublished = post.status === 'published';
            const isExpanded = expandedAdminPostId === post.id;
            return (
              <div className={isExpanded ? 'admin-post is-expanded' : 'admin-post'} key={post.id}>
                <button
                  aria-expanded={isExpanded}
                  className="admin-post-main"
                  onClick={() => onToggleExpandedPost(post.id)}
                  type="button"
                >
                  <span className="admin-post-title-row">
                    <strong>{post.title}</strong>
                    <em className={`status-badge ${isPublished ? 'published' : 'draft'}`}>{isPublished ? '已发布' : '草稿'}</em>
                  </span>
                  <small>
                    <Icon name={getCategoryIcon(post.category)} />
                    {category.name}
                    <span className="admin-post-meta-sep">·</span>
                    {new Date(post.updatedAt).toLocaleString('zh-CN')}
                  </small>
                </button>
                {isExpanded ? (
                  <div className="admin-post-actions">
                    <button onClick={() => onEdit(post)} type="button">
                      编辑
                    </button>
                    <button onClick={() => onUpdateStatus(post.id, isPublished ? 'draft' : 'published')} type="button">
                      {isPublished ? '设为草稿' : '发布'}
                    </button>
                    <button className="danger" onClick={() => onRemove(post)} type="button">
                      删除
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </>
      ) : null}
    </section>
  );
}
