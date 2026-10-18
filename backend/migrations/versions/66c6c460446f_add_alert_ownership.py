"""add alert ownership

Revision ID: 66c6c460446f
Revises: 1888f7599e2c
Create Date: 2026-10-18 12:20:37.549108

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '66c6c460446f'
down_revision: Union[str, Sequence[str], None] = '1888f7599e2c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nullable for now so existing alerts can be assigned an owner;
    # a follow-up migration makes this NOT NULL.
    op.add_column('alerts', sa.Column('user_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_alerts_user_id'), 'alerts', ['user_id'], unique=False)
    op.create_foreign_key(
        'alerts_user_id_fkey', 'alerts', 'users', ['user_id'], ['id']
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('alerts_user_id_fkey', 'alerts', type_='foreignkey')
    op.drop_index(op.f('ix_alerts_user_id'), table_name='alerts')
    op.drop_column('alerts', 'user_id')
