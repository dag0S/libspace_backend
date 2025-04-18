import { Request, Response } from "express";

import { prisma } from "../prisma/prisma-client";
import { BorrowABookDto } from "../dtos/BorrowABook.dto";
import { logAction } from "../utils/logAction";

/**
 * @route GET /api/borrowings
 * @desc Получение всех книг взятых в аренду
 * @access Private
 */
export const getBorrowings = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const borrowings = await prisma.borrowing.findMany();

    if (!borrowings) {
      throw new Error();
    }

    return res.status(200).json(borrowings);
  } catch (error) {
    return res.status(500).json({
      message: "Не удалось получить список книг взятых в аренду",
    });
  }
};

/**
 * @route GET /api/borrowings/:userId
 * @desc Получение книг взятых в аренду конкретным пользователем по userId
 * @access Private
 */
export const getBorrowingByUserId = async (
  req: Request<{ userId: string }>,
  res: Response
): Promise<any> => {
  try {
    const { userId } = req.params;

    // @ts-ignore
    if (userId !== req.user.id) {
      throw new Error();
    }

    const borrowings = await prisma.borrowing.findMany({
      where: {
        userId,
        returnedAt: null,
      },
      include: {
        book: {},
      },
    });

    if (!borrowings) {
      return res.status(500).json({
        message: "Аренды не существует",
      });
    }

    await logAction(userId, "Получение списка книг, взятых в аренду", "GET");

    return res.status(200).json(borrowings);
  } catch (error) {
    return res.status(500).json({
      message: "Не удалось получить список книг взятых в аренду",
    });
  }
};

/**
 * @route POST /api/borrowings
 * @desc Взять в аренду книгу
 * @access Private
 */
export const borrowABook = async (
  req: Request<{}, {}, BorrowABookDto>,
  res: Response
): Promise<any> => {
  try {
    const { bookId, userId } = req.body;

    if (!bookId || !userId) {
      return res.status(400).json({
        message: "Не достаточно данных, чтобы взять книгу в аренду",
      });
    }

    const existingBorrow = await prisma.borrowing.findFirst({
      where: {
        bookId,
        userId,
        returnedAt: null,
      },
    });

    if (existingBorrow) {
      return res.status(409).json({
        message: "Вы уже взяли эту книгу в аренду",
      });
    }

    const book = await prisma.book.findUnique({
      where: {
        id: bookId,
      },
      select: {
        id: true,
        copies: true,
        title: true,
      },
    });

    if (!book) {
      throw new Error();
    }

    if (book.copies <= 0) {
      return res.status(500).json({
        message:
          "Невозможно взять книгу в аренду, так как все копии книги закочились",
      });
    }

    await prisma.book.update({
      where: {
        id: book.id,
      },
      data: {
        copies: {
          decrement: 1,
        },
      },
    });

    const borrowing = await prisma.borrowing.create({
      data: {
        bookId,
        userId,
        dueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });

    if (!borrowing) {
      throw new Error();
    }

    await logAction(userId, `Взятие в аренду книги: ${book.title}`, "POST");

    return res.status(200).json({ message: "Книга взята в аренду" });
  } catch (error) {
    return res.status(500).json({
      message: "Не удалось взять в аренду книгу",
    });
  }
};

/**
 * @route PUT /api/borrowings/:id
 * @desc Вернуть книгу
 * @access Private
 */
export const returnBook = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<any> => {
  try {
    // @ts-ignore
    const userId = req.user.id;
    const { id } = req.params;

    const deletedBorrowing = await prisma.borrowing.update({
      where: { id },
      data: {
        returnedAt: new Date(),
      },
    });

    const book = await prisma.book.update({
      where: {
        id: deletedBorrowing.bookId,
      },
      data: {
        copies: {
          increment: 1,
        },
      },
    });

    await logAction(
      userId,
      `Возврат книги, взятой в аренду: ${book.title}`,
      "PUT"
    );

    return res.status(200).json({ message: "Вы успешно вернули книгу" });
  } catch (error) {
    return res.status(500).json({
      message: "Не удалось вернуть книги",
    });
  }
};

/**
 * @route DELETE /api/borrowings/:id
 * @desc Удалить аренду книги
 * @access Private
 */
export const removeBorrowing = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<any> => {
  try {
    // @ts-ignore
    const userId = req.user.id;
    const { id } = req.params;

    const deletedBorrowing = await prisma.borrowing.delete({
      where: { id },
    });

    const book = await prisma.book.update({
      where: {
        id: deletedBorrowing.bookId,
      },
      data: {
        copies: {
          increment: 1,
        },
      },
    });

    await logAction(userId, `Удаление аренды книги: ${book.title}`, "DELETE");

    return res.status(200).json({ message: "Аренда книги успешно удалена" });
  } catch (error) {
    return res.status(500).json({
      message: "Не удалось удалить аренду книги",
    });
  }
};

/**
 * @route GET /api/borrowings/check?bookId=XXX&userId=YYY
 * @desc Проверка: взята ли конкретная книга у пользователя
 * @access Private
 */
export const checkUserBookStatus = async (
  req: Request<{}, {}, {}, { bookId: string; userId: string }>,
  res: Response
): Promise<any> => {
  try {
    const { bookId, userId } = req.query;

    if (!bookId || !userId) {
      return res.status(400).json({ message: "bookId и userId обязательны" });
    }

    const existing = await prisma.borrowing.findFirst({
      where: {
        bookId,
        userId,
        returnedAt: null,
      },
    });

    return res
      .status(200)
      .json({ hasBorrowed: !!existing, borrowingId: existing?.id });
  } catch (error) {
    return res.status(500).json({
      message: "Не удалось проверить взята ли в аренду книга у пользователя",
    });
  }
};
