"""require alert owner

Revision ID: 809ac6819eca
Revises: 66c6c460446f
Create Date: 2026-10-18 12:30:13.268034

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '809ac6819eca'
down_revision: Union[str, Sequence[str], None] = '66c6c460446f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    connection = op.get_bind()

    # Verify every existing alert has an owner
    missing_owners = connection.execute(
        sa.text(
            "SELECT COUNT(*) FROM alerts "
            "WHERE user_id IS NULL"
        )
    ).scalar_one()

    if missing_owners > 0:
        raise RuntimeError(
            "Cannot require alert owners: "
            "some alerts still have no user_id"
        )

    # Require every alert to belong to a user
    op.alter_column(
        "alerts",
        "user_id",
        existing_type=sa.Integer(),
        nullable=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Allow alerts without owners again
    op.alter_column(
        "alerts",
        "user_id",
        existing_type=sa.Integer(),
        nullable=True
    )
